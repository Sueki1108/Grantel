# Grantel - Automação Contábil

Sistema de automação contábil para processamento de notas fiscais, CT-e, SPED e conciliação com Sienge.

## 🚀 Publicação

Para publicar a aplicação, você tem várias opções:

### Opção 1: Script Automatizado (Windows)

Execute o script PowerShell:
```powershell
.\deploy.ps1
```

### Opção 2: Comandos Manuais

1. **Build da aplicação:**
   ```bash
   npm run build
   ```

2. **Deploy no Firebase Hosting:**
   ```bash
   npm run deploy
   ```

### Opção 3: GitHub Pages (Automático)

Faça push para a branch `main` e o GitHub Actions fará o deploy automaticamente.

### 📖 Documentação Completa

Consulte o arquivo [DEPLOY.md](./DEPLOY.md) para instruções detalhadas sobre todas as opções de deploy.

## 🛠️ Desenvolvimento

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Build de produção
npm run build
```

## 📋 Tecnologias

- Next.js 15
- React 18
- TypeScript
- Firebase
- Tailwind CSS
- shadcn/ui

## 📝 Scripts Disponíveis

- `npm run dev` - Servidor de desenvolvimento
- `npm run build` - Build de produção
- `npm run deploy` - Build + Deploy no Firebase
- `npm run lint` - Verificar código
- `npm run typecheck` - Verificar tipos TypeScript
