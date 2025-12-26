# Script de Deploy para Grantel
# Execute este script no PowerShell para fazer o build e deploy da aplicação

Write-Host "🚀 Iniciando processo de deploy do Grantel..." -ForegroundColor Cyan

# Verifica se o Node.js está instalado
Write-Host "`n📦 Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado. Por favor, instale o Node.js primeiro." -ForegroundColor Red
    Write-Host "   Download: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Verifica se o npm está instalado
Write-Host "`n📦 Verificando npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✅ npm encontrado: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm não encontrado." -ForegroundColor Red
    exit 1
}

# Instala dependências se necessário
if (-not (Test-Path "node_modules")) {
    Write-Host "`n📥 Instalando dependências..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao instalar dependências." -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Dependências instaladas." -ForegroundColor Green
}

# Faz o build
Write-Host "`n🔨 Fazendo build da aplicação..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao fazer build." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build concluído com sucesso!" -ForegroundColor Green

# Verifica se a pasta out foi criada
if (-not (Test-Path "out")) {
    Write-Host "❌ Pasta 'out' não foi criada. Verifique os erros do build." -ForegroundColor Red
    exit 1
}

# Verifica Firebase CLI
Write-Host "`n🔥 Verificando Firebase CLI..." -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version
    Write-Host "✅ Firebase CLI encontrado: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Firebase CLI não encontrado." -ForegroundColor Yellow
    Write-Host "   Instalando Firebase CLI..." -ForegroundColor Yellow
    npm install -g firebase-tools
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao instalar Firebase CLI." -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Firebase CLI instalado." -ForegroundColor Green
}

# Pergunta sobre o tipo de deploy
Write-Host "`n📋 Escolha o tipo de deploy:" -ForegroundColor Cyan
Write-Host "   1. Apenas Hosting (recomendado)" -ForegroundColor White
Write-Host "   2. Apenas Functions" -ForegroundColor White
Write-Host "   3. Hosting + Functions" -ForegroundColor White
Write-Host "   4. Apenas build (sem deploy)" -ForegroundColor White

$deployChoice = Read-Host "Digite o número da opção"

switch ($deployChoice) {
    "1" {
        Write-Host "`n🚀 Fazendo deploy no Firebase Hosting..." -ForegroundColor Yellow
        firebase deploy --only hosting
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ Deploy concluído com sucesso!" -ForegroundColor Green
        } else {
            Write-Host "`n❌ Erro no deploy." -ForegroundColor Red
            exit 1
        }
    }
    "2" {
        Write-Host "`n🚀 Fazendo deploy das Functions..." -ForegroundColor Yellow
        firebase deploy --only functions
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ Deploy concluído com sucesso!" -ForegroundColor Green
        } else {
            Write-Host "`n❌ Erro no deploy." -ForegroundColor Red
            exit 1
        }
    }
    "3" {
        Write-Host "`n🚀 Fazendo deploy completo..." -ForegroundColor Yellow
        firebase deploy
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ Deploy concluído com sucesso!" -ForegroundColor Green
        } else {
            Write-Host "`n❌ Erro no deploy." -ForegroundColor Red
            exit 1
        }
    }
    "4" {
        Write-Host "`n✅ Build concluído. Pasta 'out' pronta para deploy manual." -ForegroundColor Green
    }
    default {
        Write-Host "`n❌ Opção inválida." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n🎉 Processo finalizado!" -ForegroundColor Cyan

