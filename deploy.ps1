# Script de Deploy para Grantel
Write-Host "🚀 Iniciando processo de deploy..." -ForegroundColor Cyan

# 1. Build
Write-Host "🔨 Fazendo build..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro no build." -ForegroundColor Red
    exit 1
}

# 2. Deploy
Write-Host "🔥 Fazendo deploy no Firebase..." -ForegroundColor Yellow
firebase deploy --only hosting
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Deploy concluído!" -ForegroundColor Green
} else {
    Write-Host "❌ Erro no deploy." -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Finalizado!" -ForegroundColor Cyan


