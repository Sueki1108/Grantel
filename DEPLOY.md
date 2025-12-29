# Guia de Publicação - Grantel

Este guia explica como publicar a aplicação Grantel em diferentes plataformas.

## Pré-requisitos

1. **Node.js** instalado (versão 20 ou superior)
2. **Firebase CLI** instalado (para deploy no Firebase)
   ```bash
   npm install -g firebase-tools
   ```
3. Conta no Firebase configurada

## Opções de Deploy

### 1. Firebase Hosting (Recomendado)

A aplicação está configurada para fazer deploy no Firebase Hosting.

#### Passos:

1. **Fazer login no Firebase:**
   ```bash
   firebase login
   ```

2. **Inicializar o projeto (se ainda não foi feito):**
   ```bash
   firebase init hosting
   ```

3. **Fazer o build e deploy:**
   ```bash
   npm run deploy
   ```
   
   Ou manualmente:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

4. **Deploy completo (hosting + functions):**
   ```bash
   npm run deploy:all
   ```

### 2. GitHub Pages (Automático via GitHub Actions)

O projeto já possui workflows configurados para deploy automático no GitHub Pages.

#### Passos:

1. **Fazer push para a branch `main` ou `master`:**
   ```bash
   git add .
   git commit -m "Preparar para deploy"
   git push origin main
   ```

2. O GitHub Actions irá automaticamente:
   - Fazer o build da aplicação
   - Fazer deploy no GitHub Pages
   - A aplicação estará disponível em: `https://[seu-usuario].github.io/Grantel/`

### 3. Vercel (Alternativa para Next.js)

Para deploy no Vercel (plataforma recomendada para Next.js):

1. **Instalar Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Fazer deploy:**
   ```bash
   vercel
   ```

   Ou conectar o repositório GitHub diretamente no dashboard do Vercel.

## Estrutura de Build

- **Pasta de build:** `out/` (gerada após `npm run build`)
- **Base path em produção:** `/Grantel`
- **Tipo de build:** Export estático (`output: 'export'`)

## Variáveis de Ambiente

Certifique-se de configurar as variáveis de ambiente necessárias no Firebase Hosting ou na plataforma escolhida:

- Variáveis do Firebase (se aplicável)
- Configurações de autenticação
- Chaves de API (se houver)

## Troubleshooting

### Erro: "Node não encontrado"
- Certifique-se de que o Node.js está instalado e no PATH
- Reinicie o terminal após instalar o Node.js

### Erro: "Firebase CLI não encontrado"
- Instale o Firebase CLI: `npm install -g firebase-tools`
- Verifique se o npm está funcionando: `npm --version`

### Build falha
- Verifique se todas as dependências estão instaladas: `npm install`
- Limpe o cache: `rm -rf .next out node_modules && npm install`

### Página em branco após deploy
- Verifique se o `basePath` está configurado corretamente
- Confirme que a pasta `out` foi gerada após o build
- Verifique os logs do Firebase Hosting

## Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Gera o build de produção na pasta `out/`
- `npm run start` - Inicia o servidor de produção (não funciona com export estático)
- `npm run deploy` - Build + Deploy no Firebase Hosting
- `npm run deploy:functions` - Deploy apenas das Cloud Functions
- `npm run deploy:all` - Deploy completo (hosting + functions)




