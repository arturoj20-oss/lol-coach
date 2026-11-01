# Publica una version nueva en GitHub Releases. Las apps instaladas la descargan e instalan solas
# (src/main/updater.js). Uso: sube "version" en package.json, haz commit y ejecuta: npm run release
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Publicando LoL Coach $version"

# Todo confirmado: la release tiene que corresponder a un commit
if (git status --porcelain) { throw 'Hay cambios sin confirmar: haz commit antes de publicar.' }
if (git tag --list "v$version") { throw "La v$version ya existe: sube la version en package.json." }

$token = gh auth token
if (-not $token) { throw 'No hay sesion de GitHub: ejecuta gh auth login.' }
$env:GH_TOKEN = $token

git push origin HEAD
if ($LASTEXITCODE) { throw 'git push ha fallado.' }

# Instalador + latest.yml (lo que lee el actualizador) subidos a la release v<version>
npx electron-builder --win nsis --publish always
if ($LASTEXITCODE) { throw 'electron-builder ha fallado.' }

git fetch --tags --quiet
Write-Host "Publicada la v$version"
