# Documentação Técnica e Funcional da Aplicação Grantel

## 1. Visão Geral e Arquitetura

Esta aplicação é uma ferramenta de automação fiscal e contábil desenvolvida em **Next.js** com **React** e **TypeScript**. O seu objetivo é validar, conciliar e analisar grandes volumes de documentos fiscais (XML e planilhas) para garantir a conformidade e identificar inconsistências antes da submissão aos órgãos fiscais.

A interface é organizada num fluxo de trabalho baseado em abas (`Tabs` do ShadCN), guiando o utilizador desde o carregamento dos dados até à análise final. O estado da aplicação é gerido localmente dentro do componente principal `AutomatorClientPage` usando hooks do React (`useState`, `useMemo`, `useCallback`).

Toda a lógica de processamento de dados pesados é executada no cliente (navegador) através de funções auxiliares em JavaScript, localizadas em `src/lib/`.

---

## 2. Estrutura de Componentes e Fluxo de Dados

O ponto de entrada da funcionalidade principal é `src/app/automator/page.tsx`, que renderiza o componente cliente `AutomatorClientPage`.

### `src/app/automator/page-client.tsx`

Este é o componente central que orquestra toda a aplicação.

-   **Gestão de Estado:**
    -   `files`: Armazena os dados extraídos de planilhas `.xlsx` (`{ [fileName: string]: any[] }`).
    -   `xmlFiles`: Armazena os ficheiros XML carregados, categorizados por tipo (`{ nfeEntrada: File[], cte: File[], nfeSaida: File[], nfse: File[] }`).
    -   `processedData`: Objeto que armazena todos os resultados após o processamento. Contém as planilhas de resultados (`sheets`), informações do SPED (`spedInfo`), etc. É a principal fonte de dados para todas as abas de análise.
    -   `logs`: Array de strings que regista cada passo do processo para depuração.
    -   `selectedPeriods`: Regista os meses (`YYYY-MM`) que o utilizador selecionou para análise.

-   **Fluxo de Interação:**
    1.  O utilizador carrega ficheiros através do componente `FileUploadForm`.
    2.  As funções `handleXmlFileChange` e `handleFileChange` são chamadas. Elas usam `JSZip` para extrair XMLs de ficheiros `.zip` e `XLSX` (sheetjs) para ler planilhas.
    3.  O utilizador clica em "Validar Dados", que aciona `startPeriodSelection`.
    4.  `startPeriodSelection`: Pré-processa todos os ficheiros carregados para extrair as datas de emissão (`dhEmi`, `Emissão`) e apresenta um modal (`Dialog`) para o utilizador selecionar os períodos de competência.
    5.  `handleSubmit`: Após a seleção do período, esta função é o coração do processamento.
        -   Filtra todos os dados carregados (XMLs e planilhas) para incluir apenas os documentos dos `selectedPeriods`.
        -   Chama a função `processUploadedXmls` para converter os ficheiros XML em estruturas de dados JSON.
        -   Chama a função `processDataFrames` com os dados JSON para aplicar todas as regras de negócio.
        -   Atualiza o estado `processedData` com os resultados, o que faz com que as tabelas de resultados (`ResultsDisplay`) e as outras abas sejam renderizadas com os dados corretos.

---

## 3. Lógica de Processamento Detalhada

### Módulo: `src/lib/xml-processor.ts`

-   **Função Principal: `processUploadedXmls`**
    -   Recebe um array de ficheiros `File`.
    -   Itera sobre cada ficheiro, lê o seu conteúdo como texto.
    -   Usa `DOMParser` para converter o texto em um documento XML.
    -   **Identificação do Tipo de XML:**
        -   Verifica a presença da tag `<nfeProc>` para identificar uma **NF-e**.
        -   Verifica a presença da tag `<cteProc>` para identificar um **CT-e**.
        -   Verifica a presença de `<procEventoNFe>` ou `<procEventoCTe>` para identificar um **Evento** (ex: Cancelamento).
    -   Chama a função de parsing apropriada (`parseNFe`, `parseCTe`, `parseCancelEvent`).
    -   Agrega os resultados de todos os ficheiros num único objeto `XmlData`.

-   **Função: `parseNFe`**
    -   Extrai a `infNFe` e a `protNFe`.
    -   **Chave de Acesso:** Obtida do atributo `Id` da tag `infNFe`, removendo o prefixo "NFe".
    -   **Status:** Determinado pelo `cStat` dentro de `infProt`. '100' é 'Autorizada', outros são 'Canceladas'.
    -   **Distinção Entrada/Saída:** Compara o CNPJ do `emit` com o CNPJ da Grantel (`81732042000119`). Se for igual, é classificada como **Saída**. Caso contrário, é **Entrada**.
    -   **Extração de Dados (Cabeçalho):** Extrai `nNF`, `dhEmi`, `vNF`, e dados do emitente e destinatário.
    -   **Extração de Itens (`det`):** Itera sobre cada tag `det` para extrair os dados do produto (`prod`) e dos impostos (`imposto`). Todos os campos dentro de `prod` e `imposto` são extraídos e prefixados (ex: `prod_cProd`).
    -   **Chave Única (`Chave Unica`):** Cria uma chave composta por `cleanAndToStr(Número da Nota) + cleanAndToStr(CNPJ do Emitente/Destinatário)` para facilitar a ligação entre a nota e os seus itens.

-   **Função: `parseCTe`**
    -   Semelhante à `parseNFe`, mas adaptada para a estrutura do CT-e.
    -   Extrai dados de `ide`, `emit`, `rem` (remetente), `dest` (destinatário) e `vPrest` (valor da prestação).
    -   O status também é determinado pelo `cStat` em `infProt`.

-   **Função: `parseCancelEvent`**
    -   Procura por eventos com `tpEvento` '110111' (Cancelamento).
    -   Extrai a `chNFe` (chave da nota cancelada) e adiciona-a ao conjunto `canceledKeys`.

### Módulo: `src/lib/excel-processor.ts`

-   **Função Principal: `processDataFrames`**
    -   Esta é a função central que aplica as regras de negócio aos dados já extraídos.
    -   **Preparação:**
        1.  Copia os dataframes recebidos para `originalDfs` para posterior download.
        2.  Aplica `addChaveUnica` e `renameChaveColumn` para padronizar os dados.
    -   **Coleta de Exceções:**
        1.  Inicia um `Set` (`chavesExcecao`) com as chaves de cancelamento por evento recebidas do `xml-processor`.
        2.  Itera sobre os dataframes de NF-e, CT-e e Saídas, adicionando ao `Set` as chaves de notas cujo `Status` seja 'cancelada'.
        3.  Adiciona ao `Set` **todas** as chaves presentes nas planilhas de manifesto (`NFE Operação Não Realizada`, `NFE Operação Desconhecida`, `CTE Desacordo de Serviço`).
    -   **Identificação de Emissão Própria (Devoluções):**
        1.  Itera sobre os `Itens` de entrada.
        2.  Se um item tem um CFOP que começa com '1' ou '2' (indicando devolução/retorno de venda), a sua `Chave Unica` é adicionada ao `Set` `chavesEmissaoPropriaEntrada`.
    -   **Filtragem Principal:**
        1.  **`notasValidas`**: É o resultado da filtragem do dataframe `NFE`, removendo todas as notas cuja `Chave de acesso` está em `chavesExcecao` e cuja `Chave Unica` está em `chavesEmissaoPropriaEntrada`.
        2.  **`ctesValidos`**: Filtra o dataframe `CTE`, removendo as chaves de `chavesExcecao`.
        3.  **`saidasValidas`**: Filtra o dataframe `Saídas`, removendo as chaves de `chaveExcecao`.
    -   **Filtragem de Itens:**
        1.  **`itensValidos`**: Filtra o dataframe `Itens`, mantendo apenas os itens cuja `Chave Unica` corresponde a uma nota em `notasValidas`.
        2.  **`itensValidosSaidas`**: Filtra o dataframe `Itens Saídas` com base nas `saidasValidas`.
    -   **Geração de Listas Finais:**
        1.  **`imobilizados`**: Filtra `itensValidos` para itens cujo CFOP seja '1551', '2551', '1556' ou '2556'.
        2.  **`notasCanceladas`**: Agrupa todas as notas (NFE, CTE, Saídas) que foram identificadas como exceção.
        3.  **`emissaoPropria`**: Agrupa as notas de entrada que foram classificadas como devolução de cliente.
        4.  **`chavesValidas`**: Cria uma lista simplificada contendo a chave de acesso, tipo, fornecedor, data e valor de todas as `notasValidas`, `ctesValidos` e `saidasValidas`. Esta lista é a base para a verificação SPED.
    -   **Enriquecimento com Descrição do CFOP:**
        -   Usa a função `addCfopDescriptionToRow` e o dicionário `src/lib/cfop.ts` para adicionar a descrição do CFOP a todas as linhas das planilhas de resultado relevantes.

---

## 4. Funcionalidades por Aba

### Aba 1: Validação

-   **Componente:** `page-client.tsx`
-   **Lógica:** Conforme descrito acima, lida com o carregamento, pré-processamento e processamento principal.
-   **Resultado:** Renderiza o `ResultsDisplay` que contém uma `Tabs` com `DataTable` para cada planilha de resultado gerada pelo `processDataFrames`.

### Aba 2: Análise Saídas

-   **Componente:** `src/components/app/saidas-analysis.tsx`
-   **Lógica:**
    -   Recebe a lista de `saidasValidas` e um mapa de status manuais (`initialStatus`).
    -   Ordena as notas por número.
    -   Calcula o intervalo completo de números de nota, desde a `lastPeriodNumber + 1` até à maior nota do período.
    -   **Geração da Sequência:** Itera sobre o intervalo numérico e, para cada número:
        -   Se a nota existe nos dados, exibe os seus detalhes. O status é o status manual (se existir) ou 'emitida'.
        -   Se a nota **não** existe (uma falha na sequência), cria uma linha de "Intervalo" com o status 'inutilizada' por defeito.
    -   **Interatividade:**
        -   Botões ("Marcar Cancelada", "Marcar Inutilizada", "Reverter para Emitida") atualizam o estado local (`statusMap`) e notificam o componente pai (`onStatusChange`) para persistir essa classificação na sessão.
        -   Permite marcar um intervalo de notas como "inutilizado" de uma só vez.
        -   Um campo de input permite ao utilizador inserir a última nota do período anterior para detetar falhas no início da sequência.

### Aba 3: Análise NFS-e

-   **Componente:** `src/components/app/nfse-analysis.tsx`
-   **Lógica:**
    -   Processa exclusivamente os ficheiros da categoria `nfse` do estado `xmlFiles`.
    -   **Extração de Dados:** Itera sobre os XMLs, extraindo dados da nota (`numero_nfse`, `valor_total`, etc.) e dos itens (`codigo_item_lista_servico`, `descritivo`).
    -   **Análise de Suspensão de Impostos:**
        -   Normaliza o texto do campo `descritivo` (converte para minúsculas, remove acentos e pontuação).
        -   Se o texto normalizado contiver frases exatas como "suspensao da exigibilidade", a nota é classificada e somada nos resumos de "Suspensão".
        -   Se contiver apenas a palavra "suspensao" (sem a frase completa), a nota é marcada como "Pendente de Verificação" para análise manual.
    -   **Cálculo de Resumos:** Calcula os totais para os cartões de resumo (Soma Total, Somas por Código de Serviço, Somas de Suspensão, Somas de cada tipo de Retenção).
    -   **Filtragem Manual:** Permite ao utilizador inserir números de notas para serem desconsideradas da análise, recalculando os totais dinamicamente.
    -   **Visualização:** Apresenta os resumos em `Card`s e os dados detalhados em `DataTable` dentro de `Tabs`.

### Aba 4: Imobilizado

-   **Componente:** `src/components/app/additional-analyses.tsx` (condicionalmente renderizado)
-   **Lógica:**
    -   Renderiza quando a `activeTab` é 'imobilizado'.
    -   Exibe a tabela `Imobilizados` (gerada na Aba 1) numa `DataTable`.
    -   Adiciona uma coluna de "Ações" com dois botões: "Uso e Consumo" e "Ativo Imobilizado".
    -   **Classificação Manual:** Clicar num botão atualiza o estado `imobilizadoStatus` no `page-client.tsx`, que armazena a classificação do utilizador para cada item (usando o `id` único do item). Esta classificação é mantida apenas durante a sessão.

### Aba 5: Análises Finais

-   **Componente:** `src/components/app/additional-analyses.tsx`
-   **Lógica:** Este componente complexo gere as três sub-funcionalidades.

    -   **Verificação SPED (sub-componente `KeyChecker`):**
        -   **Carregamento:** O utilizador carrega o ficheiro `.txt` do SPED.
        -   **Extração de Chaves SPED:** A função `checkSpedKeysInBrowser` lê o ficheiro SPED linha a linha, extraindo chaves de 44 dígitos dos registos `C100` (NF-e) e `D100` (CT-e), juntamente com data, valor e código do participante.
        -   **Comparação:**
            1.  Cria um `Map` com as chaves da lista `Chaves Válidas` (da Aba 1).
            2.  Cria um `Map` com as chaves extraídas do SPED.
            3.  Compara os dois mapas para produzir três listas: `keysNotFoundInTxt` (chaves da planilha que não estão no SPED), `keysInTxtNotInSheet` (chaves do SPED que não estão na planilha), e `validKeys` (chaves em ambos).
        -   **Análise de Divergências:** Para as `validKeys`, compara os campos:
            -   `Data Emissão`: Compara a data do XML com a `dtDoc` do SPED.
            -   `Valor`: Compara o valor total do XML com o `vlDoc` do SPED.
            -   `UF` e `IE`: Para NF-e destinadas à Grantel, compara a UF e a IE do destinatário do XML com os valores fixos da Grantel.
            -   Gera uma lista consolidada de divergências.
        -   **Correção de SPED:** A função `processSpedFileInBrowser` oferece uma funcionalidade de suporte que:
            -   Remove registos `0190` desnecessários.
            -   Padroniza unidades de medida para "un".
            -   Corrige a série de CT-e (`D100`) e a IE de participantes (`0150`) com base nos dados dos XMLs.
            -   Trunca campos de texto longos.
            -   Recalcula todos os contadores de registos (`x990`, `9999`).

    -   **Conciliação Itens (XML vs Sienge):**
        -   **Carregamento:** O utilizador carrega a planilha "Itens do Sienge".
        -   **Lógica (`useReconciliation`):** Implementa uma lógica de conciliação em múltiplas passagens para maximizar os matches. Para cada passagem, os itens não conciliados da passagem anterior são usados na seguinte.
            1.  Filtra a planilha Sienge para manter apenas linhas onde a coluna "Esp" é 'NFE' ou 'NFSR'.
            2.  Cria uma chave de comparação (`Número-CNPJ-Valor`).
            3.  **Passagens de Conciliação:** Tenta conciliar usando diferentes campos de valor:
                -   `Valor Total` (XML) vs `Valor Total` (Sienge)
                -   `Valor Total` (XML) vs `ICMS Outras` (Sienge)
                -   `Valor Total` (XML) vs `Valor Total + Desconto` (Sienge)
                -   `Valor Total` (XML) vs `Valor Total - Frete` (Sienge)
                -   ... e outras combinações com IPI, ICMS-ST, Despesas, etc.
                -   `Valor Unitário` (XML) vs `Preço Unitário` (Sienge)
                -   Agregação por produto, somando valores de itens com a mesma descrição dentro da mesma nota.
            4.  **Resultados:** Apresenta três tabelas: `Conciliados`, `Apenas no Sienge`, `Apenas no XML`.

    -   **Conferência e Revenda (Sienge):**
        -   **Conferência de Impostos:** A partir da planilha Sienge carregada:
            -   Extrai e exibe em tabelas separadas todos os itens que têm valores de ICMS, PIS, COFINS, IPI e ICMS-ST.
            -   Verifica a consistência entre o CFOP e a UF do fornecedor. Se a UF for 'PR' (interno) mas o primeiro dígito do CFOP for '2' (interestadual), ou vice-versa, a linha é marcada como inconsistente e uma correção é sugerida.
        -   **Exportação de Revenda (`handleAnalyzeResale`):**
            -   Identifica linhas na planilha Sienge com CFOPs de revenda (ex: '1102', '2102').
            -   Cria um `Set` de chaves compostas (`Número-CNPJ`) para estas notas.
            -   Itera sobre todos os ficheiros XML de entrada previamente carregados.
            -   Para cada XML, extrai o seu número e CNPJ do emitente.
            -   Se a chave composta (`Número-CNPJ`) do XML existir no `Set` de revenda, o ficheiro `File` original é adicionado a uma lista de `matchedXmls`.
            -   Permite ao utilizador baixar um ficheiro `.zip` contendo apenas esses ficheiros XML de revenda.
