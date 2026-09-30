# Publica o site do seu PC via Cloudflare Tunnel (grátis, sem conta).
# Uso: npm run publicar   (Ctrl+C encerra tudo)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# cloudflared: usa o do PATH ou o baixado em %LOCALAPPDATA%\cloudflared
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe' }
if (-not (Test-Path $cf)) {
  Write-Host 'Baixando cloudflared (oficial, GitHub da Cloudflare)...'
  New-Item -ItemType Directory -Force (Split-Path $cf) | Out-Null
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf -UseBasicParsing
}

$port = if ($env:PORT) { $env:PORT } else { '3000' }
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
  Write-Host "A porta $port já está em uso (o 'npm run dev' está rodando?). Pare ele e rode de novo." -ForegroundColor Yellow
  exit 1
}

Write-Host 'Compilando o front...'
npm run build --silent
if ($LASTEXITCODE -ne 0) { exit 1 }

$env:TRUST_PROXY = '1'   # IP real dos visitantes no limite de tentativas de login
$env:PORT = $port
$server = Start-Process node -ArgumentList 'server.js' -NoNewWindow -PassThru
try {
  Start-Sleep -Seconds 2
  Write-Host ''
  Write-Host 'Abrindo o túnel. Procure a linha com https://....trycloudflare.com e mande esse link pro time.' -ForegroundColor Green
  Write-Host 'Deixe esta janela aberta. Ctrl+C derruba o site.' -ForegroundColor Green
  Write-Host ''
  & $cf tunnel --no-autoupdate --url "http://localhost:$port"
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Write-Host 'Site fora do ar.'
}
