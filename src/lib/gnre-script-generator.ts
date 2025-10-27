

export type GnreConfig = {
    URL_SITE: string;
    UF_ALVO: string;
    UF_ALVO_EMITENTE: string;
    CNPJ_ALVO: string;
    RAZAO_SOCIAL_ALVO: string;
    ENDERECO_ALVO: string;
    CEP_ALVO: string;
    MUNICIPIO_ALVO_EMITENTE: string;
    TELEFONE_ALVO: string;
    RECEITA_ALVO: string;
    CNPJ_DESTINATARIO: string;
    RAZAO_SOCIAL_DESTINATARIO: string;
    UF_DESTINATARIO: string;
    MUNICIPIO_ALVO_DESTINATARIO: string;
};


type GnreDataItem = {
    filename: string;
    chave_acesso: string;
    valor_principal_calculado: number;
    valor_principal_gnre: string;
};

export const GNRE_DEFAULT_CONFIGS: GnreConfig = {
    "URL_SITE": "https://www.gnre.pe.gov.br:444/gnre/v/guia/index",
    "UF_ALVO": "MS",
    "UF_ALVO_EMITENTE": "PR",
    "CNPJ_ALVO": "81732042000119",
    "RAZAO_SOCIAL_ALVO": "GRANTEL ENGENHARIA LTDA",
    "ENDERECO_ALVO": "RUA PARANAGUA, 78",
    "CEP_ALVO": "83410390",
    "MUNICIPIO_ALVO_EMITENTE": "4106902", // O código para Curitiba-PR
    "TELEFONE_ALVO": "4133386454",
    "RECEITA_ALVO": "100102",
    "CNPJ_DESTINATARIO": "81732042000119",
    "RAZAO_SOCIAL_DESTINATARIO": "GRANTEL ENGENHARIA LTDA",
    "UF_DESTINATARIO": "MS",
    "MUNICIPIO_ALVO_DESTINATARIO": "5007906" // O código para Selvíria-MS
};

export function generateGnreScript(
    gnreData: GnreDataItem[],
    vencimentoAlvo: string,
    dataPagamentoAlvo: string,
    gnreConfigs: GnreConfig
): string {

    const seleniumImports = `
# -*- coding: utf-8 -*-
# --- CÓDIGO GERADO PELA APLICAÇÃO GRANTEL - NÃO ALTERE AS VARIÁVEIS PRINCIPAIS ---
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.common.exceptions import WebDriverException, NoSuchElementException
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import sys
import os
from selenium.webdriver.common.keys import Keys
try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    print("webdriver-manager não encontrado. A instalar...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "webdriver-manager"])
    from webdriver_manager.chrome import ChromeDriverManager
`;

    const gnreItemsString = gnreData.map(data => 
        `    {"chave": "${data.chave_acesso}", "valor_gnre": "${data.valor_principal_gnre}", "valor_real": "${data.valor_principal_calculado.toFixed(2)}"}`
    ).join(',\n');

    const gnreListContent = `
GNRE_LISTA_DADOS = [
${gnreItemsString}
]
`;

    const configVars = `
# VARIÁVEIS DINÂMICAS (Datas inseridas na aplicação)
VENCIMENTO_ALVO = "${vencimentoAlvo}"
DATA_PAGAMENTO_ALVO = "${dataPagamentoAlvo}"

# VARIÁVEIS FIXAS (Informações do Emitente/Destinatário)
URL_SITE = "${gnreConfigs.URL_SITE}"
UF_ALVO = "${gnreConfigs.UF_ALVO}"
UF_ALVO_EMITENTE = "${gnreConfigs.UF_ALVO_EMITENTE}"
CNPJ_ALVO = "${gnreConfigs.CNPJ_ALVO}"
RAZAO_SOCIAL_ALVO = "${gnreConfigs.RAZAO_SOCIAL_ALVO}"
ENDERECO_ALVO = "${gnreConfigs.ENDERECO_ALVO}"
CEP_ALVO = "${gnreConfigs.CEP_ALVO}"
MUNICIPIO_ALVO_EMITENTE = "${gnreConfigs.MUNICIPIO_ALVO_EMITENTE}"
TELEFONE_ALVO = "${gnreConfigs.TELEFONE_ALVO}"
RECEITA_ALVO = "${gnreConfigs.RECEITA_ALVO}"
CNPJ_DESTINATARIO = "${gnreConfigs.CNPJ_DESTINATARIO}"
RAZAO_SOCIAL_DESTINATARIO = "${gnreConfigs.RAZAO_SOCIAL_DESTINATARIO}"
UF_DESTINATARIO = "${gnreConfigs.UF_DESTINATARIO}"
MUNICIPIO_ALVO_DESTINATARIO = "${gnreConfigs.MUNICIPIO_ALVO_DESTINATARIO}"
`;

    const automationFunction = `
# --- Seletores de Elementos (ID's do site GNRE) ---
ID_DROPDOWN_UF = "ufFavorecida"
ID_FIELDSET_TIPO_GNRE = "fsTipoGnre"
ID_RADIO_SIMPLES = "optGnreSimples"

# ... (outros IDs de elementos)
ID_DROPDOWN_UF_EMITENTE = "ufEmitente"
ID_RADIO_INSCRITO_NAO_EMITENTE = "optNaoInscrito"
ID_RADIO_CNPJ = "tipoCNPJ"
ID_CAMPO_CNPJ = "documentoEmitente"
ID_CAMPO_RAZAO_SOCIAL = "razaoSocialEmitente"
ID_CAMPO_ENDERECO = "enderecoEmitente"
ID_CAMPO_CEP = "cepEmitente"
ID_DROPDOWN_MUNICIPIO_EMITENTE = "municipioEmitente"
ID_CAMPO_TELEFONE = "telefoneEmitente"
ID_DROPDOWN_RECEITA = "receita"
ID_CAMPO_VENCIMENTO = "dataVencimento"
ID_CAMPO_VALOR_PRINCIPAL = "valor"
ID_RADIO_INSCRITO_NAO_DESTINATARIO = "optNaoInscritoDest"
ID_RADIO_CNPJ_DESTINATARIO = "tipoCNPJDest"
ID_CAMPO_CNPJ_DESTINATARIO = "documentoDestinatario"
ID_CAMPO_RAZAO_SOCIAL_DESTINATARIO = "razaoSocialDestinatario"
ID_DROPDOWN_UF_DESTINATARIO = "ufDestinatario"
ID_DROPDOWN_MUNICIPIO_DESTINATARIO = "municipioDestinatario"
ID_CAMPO_CHAVE_ACESSO = "campoAdicional00"
ID_CAMPO_DATA_PAGAMENTO = "dataPagamento"
ID_BOTAO_INCLUIR = "btnIncluir"
ID_BOTAO_VALIDAR = "validar"
ID_BOTAO_BAIXAR = "baixar"
ID_BOTAO_NOVA_GUIA = "novaGuia"

TIMEOUT = 15 # Tempo máximo de espera

def run_automation_for_item(driver, item_data, vencimento, data_pagamento):
    # Executa a automação de uma GNRE, usando dados da nota fiscal.
    
    CHAVE_ACESSO_ALVO = item_data['chave']
    VALOR_PRINCIPAL_ALVO = item_data['valor_gnre']
    VENCIMENTO_ALVO = vencimento
    DATA_PAGAMENTO_ALVO = data_pagamento
    
    print(f"\\n--- Processando GNRE para Chave de Acesso: {CHAVE_ACESSO_ALVO} (Valor R$ {item_data['valor_real']}) ---")
    sys.stdout.flush()

    try:
        driver.get(URL_SITE)
        time.sleep(3) 

        print(f"1. Selecionando UF Favorecida: {UF_ALVO}...")
        dropdown_element = driver.find_element(By.ID, ID_DROPDOWN_UF)
        select = Select(dropdown_element)
        select.select_by_value(UF_ALVO)

        WebDriverWait(driver, TIMEOUT).until(
            EC.visibility_of_element_located((By.ID, ID_FIELDSET_TIPO_GNRE))
        )
        radio_simples_element = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, ID_RADIO_SIMPLES))
        )
        driver.execute_script("arguments[0].click();", radio_simples_element)
        print("2. Opção 'GNRE Simples' marcada.")
        time.sleep(1)

        print("3. Preenchendo Dados do Emitente...")
        
        radio_inscrito_nao_emitente = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, ID_RADIO_INSCRITO_NAO_EMITENTE))
        )
        driver.execute_script("arguments[0].click();", radio_inscrito_nao_emitente)

        radio_cnpj_element = driver.find_element(By.ID, ID_RADIO_CNPJ)
        driver.execute_script("arguments[0].click();", radio_cnpj_element)
        campo_cnpj_element = driver.find_element(By.ID, ID_CAMPO_CNPJ)
        driver.execute_script(f"arguments[0].value = '{CNPJ_ALVO}';", campo_cnpj_element)
        campo_cnpj_element.send_keys(Keys.TAB)
        time.sleep(1.5)

        campo_razao_social_element = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, ID_CAMPO_RAZAO_SOCIAL))
        )
        campo_razao_social_element.clear()
        campo_razao_social_element.send_keys(RAZAO_SOCIAL_ALVO)
        campo_razao_social_element.send_keys(Keys.TAB)

        driver.find_element(By.ID, ID_CAMPO_ENDERECO).send_keys(ENDERECO_ALVO)
        campo_telefone_element = driver.find_element(By.ID, ID_CAMPO_TELEFONE)
        driver.execute_script(f"arguments[0].value = '{TELEFONE_ALVO}';", campo_telefone_element)
        campo_telefone_element.send_keys(Keys.TAB)

        select_uf_emitente = Select(driver.find_element(By.ID, ID_DROPDOWN_UF_EMITENTE))
        select_uf_emitente.select_by_value(UF_ALVO_EMITENTE)
        time.sleep(1)
        
        campo_cep_element = driver.find_element(By.ID, ID_CAMPO_CEP)
        campo_cep_element.send_keys(CEP_ALVO)
        driver.execute_script("arguments[0].dispatchEvent(new Event('change'));", campo_cep_element)
        time.sleep(1) # Espera extra para o JS da página reagir

        WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.XPATH, f"//select[@id='{ID_DROPDOWN_MUNICIPIO_EMITENTE}']/option[@value='{MUNICIPIO_ALVO_EMITENTE}']"))
        )
        select_municipio_emitente = Select(driver.find_element(By.ID, ID_DROPDOWN_MUNICIPIO_EMITENTE))
        select_municipio_emitente.select_by_value(MUNICIPIO_ALVO_EMITENTE)

        print("4. Preenchendo Receita, Vencimento e Valor Principal...")

        WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.XPATH, f"//select[@id='{ID_DROPDOWN_RECEITA}']/option[@value='{RECEITA_ALVO}']"))
        )
        select_receita = Select(driver.find_element(By.ID, ID_DROPDOWN_RECEITA))
        select_receita.select_by_value(RECEITA_ALVO)

        driver.find_element(By.ID, ID_CAMPO_VENCIMENTO).send_keys(VENCIMENTO_ALVO)
        driver.find_element(By.ID, ID_CAMPO_VALOR_PRINCIPAL).send_keys(VALOR_PRINCIPAL_ALVO)

        print("5. Preenchendo Dados do Destinatário...")

        radio_inscrito_nao_destinatario = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, ID_RADIO_INSCRITO_NAO_DESTINATARIO))
        )
        driver.execute_script("arguments[0].click();", radio_inscrito_nao_destinatario)

        WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, ID_RADIO_CNPJ_DESTINATARIO))
        ).click()

        campo_cnpj_destinatario_element = driver.find_element(By.ID, ID_CAMPO_CNPJ_DESTINATARIO)
        driver.execute_script(f"arguments[0].value = '{CNPJ_DESTINATARIO}';", campo_cnpj_destinatario_element)
        campo_cnpj_destinatario_element.send_keys(Keys.TAB)
        time.sleep(1.5)

        campo_razao_social_destinatario_element = driver.find_element(By.ID, ID_CAMPO_RAZAO_SOCIAL_DESTINATARIO)
        campo_razao_social_destinatario_element.clear()
        campo_razao_social_destinatario_element.send_keys(RAZAO_SOCIAL_DESTINATARIO)
        campo_razao_social_destinatario_element.send_keys(Keys.TAB)

        WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.XPATH, f"//select[@id='{ID_DROPDOWN_MUNICIPIO_DESTINATARIO}']/option[@value='{MUNICIPIO_ALVO_DESTINATARIO}']"))
        )
        select_municipio_destinatario = Select(driver.find_element(By.ID, ID_DROPDOWN_MUNICIPIO_DESTINATARIO))
        select_municipio_destinatario.select_by_value(MUNICIPIO_ALVO_DESTINATARIO)

        print("6. Preenchendo Outras Informações (Chave de Acesso e Data Pagamento)...")

        WebDriverWait(driver, TIMEOUT).until(EC.presence_of_element_located((By.ID, ID_CAMPO_CHAVE_ACESSO)))
        driver.find_element(By.ID, ID_CAMPO_CHAVE_ACESSO).send_keys(CHAVE_ACESSO_ALVO)

        campo_data_pagamento = driver.find_element(By.ID, ID_CAMPO_DATA_PAGAMENTO)
        campo_data_pagamento.send_keys(DATA_PAGAMENTO_ALVO)
        campo_data_pagamento.send_keys(Keys.TAB)

        print("7. Incluindo Item...")
        try:
            botao_incluir = WebDriverWait(driver, TIMEOUT).until(
                EC.element_to_be_clickable((By.ID, ID_BOTAO_INCLUIR))
            )
            driver.execute_script("arguments[0].click();", botao_incluir)
            time.sleep(3) 

        except Exception as e:
            print(f"AVISO: Não foi possível clicar no botão 'Incluir'. Pode haver um erro no formulário. Detalhe: {e}")
            return False 

        print("8. Validando Guia...")
        try:
            botao_validar = WebDriverWait(driver, TIMEOUT).until(
                EC.element_to_be_clickable((By.ID, ID_BOTAO_VALIDAR))
            )
            driver.execute_script("arguments[0].click();", botao_validar)
            time.sleep(5) 

        except Exception as e:
            print(f"AVISO: Não foi possível clicar no botão 'Validar'. Detalhe: {e}")
            return False

        print("9. Baixando PDF da Guia...")
        try:
            botao_baixar = WebDriverWait(driver, TIMEOUT).until(
                EC.element_to_be_clickable((By.ID, ID_BOTAO_BAIXAR))
            )
            driver.execute_script("arguments[0].click();", botao_baixar)
            print(f"\\nSUCESSO! Guia para a chave {CHAVE_ACESSO_ALVO} baixada. Aguardando 4 segundos...")
            time.sleep(4)

        except Exception as e:
            print(f"AVISO: Não foi possível clicar no botão 'Baixar PDF'. Verifique o download manual.")

        return True 

    except NoSuchElementException:
        print(f"FALHA CRÍTICA: Não foi possível encontrar um elemento na página. Automação encerrada para a nota {CHAVE_ACESSO_ALVO}.")
        return False
    except Exception as e:
        print(f"OCORREU UM ERRO INESPERADO para a nota {CHAVE_ACESSO_ALVO}: {e}")
        return False

def main_loop():
    driver = None
    
    download_dir = os.path.join(os.getcwd(), "guias_gnre")
    if not os.path.exists(download_dir):
        try:
            os.makedirs(download_dir)
        except OSError as e:
            print(f"ERRO ao criar diretório de download: {e}. Usando diretório padrão.")
            download_dir = None
            
    try:
        print("\\n--- INICIANDO O PROCESSO DE AUTOMAÇÃO SELENIUM EM LOOP ---")
        print("Instalando e iniciando o ChromeDriver...")
        
        options = webdriver.ChromeOptions()
        # options.add_argument("--headless") 
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        
        prefs = {
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "plugins.always_open_pdf_externally": True 
        }
        if download_dir:
            prefs["download.default_directory"] = download_dir
        options.add_experimental_option("prefs", prefs)
        
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.implicitly_wait(TIMEOUT)
        
        print(f"Navegador iniciado com sucesso! Downloads serão salvos em: {download_dir if download_dir else 'diretório padrão'}")

        total_guias = len(GNRE_LISTA_DADOS)
        print(f"Iniciando o loop para processar {total_guias} guias...")
        
        for i, item in enumerate(GNRE_LISTA_DADOS):
            print(f"\\n================ [ GUIA {i+1} de {total_guias} ] ================")
            
            success = run_automation_for_item(driver, item, VENCIMENTO_ALVO, DATA_PAGAMENTO_ALVO)
            
            if not success and i < total_guias - 1:
                print(f"AVISO: A automação falhou na Guia {i+1}. O script irá parar. Verifique o erro e tente novamente.")
                break # Pára o loop em caso de falha
            elif not success and i == total_guias - 1:
                print("AVISO: A automação falhou na última Guia. Processo concluído com erros.")
            
            if i < total_guias - 1 and success:
                print("Aguardando 2 segundos antes de iniciar a próxima GNRE...")
                time.sleep(2)
        
        print("\\n" + "=" * 50)
        print("PROCESSO DE AUTOMAÇÃO CONCLUÍDO. Verifique a pasta 'guias_gnre' pelos PDFs.")
        print("Pressione ENTER para fechar o navegador...")
        input() 
        print("Fechando o navegador...")

    except WebDriverException as wde:
        print("\\nFALHA CRÍTICA AO INICIAR O NAVEGADOR:")
        print("Verifique a instalação do Chrome e do chromedriver.")
        print(f"Detalhe: {wde}")
        sys.exit(1)
    except Exception as e:
        print("\\nOCORREU UM ERRO INESPERADO NO LOOP PRINCIPAL:")
        print(f"Detalhe: {e}")
        sys.exit(1)
    finally:
        if driver:
            driver.quit()

if __name__ == '__main__':
    main_loop()

`;

    return seleniumImports + gnreListContent + configVars + automationFunction;
}
