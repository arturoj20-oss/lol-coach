# Publica una version nueva en GitHub Releases. Las apps instaladas la descargan e instalan solas
# (src/main/updater.js). Uso: sube "version" en package.json, haz commit y ejecuta: npm run release
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Publicando LoL Coach $version"

# Todo confirmado: la release tiene que corresponder a un commit
if (git status --porcelain) { throw 'Hay cambios sin confirmar: haz commit antes de publicar.' }
if (git tag --list "v$version") { throw "La v$version ya existe: sube la version en package.json." }

# Sin la URL del webhook (en .gitignore) la version sale sin reportes de bugs
if (-not (Test-Path 'src\main\report-webhook.txt')) { throw 'Falta src\main\report-webhook.txt (URL del webhook de Discord para los reportes).' }
if (-not (Test-Path 'src\main\installs-webhook.txt')) { throw 'Falta src\main\installs-webhook.txt (URL del webhook de Discord para los avisos de instalacion).' }

$token = gh auth token
if (-not $token) { throw 'No hay sesion de GitHub: ejecuta gh auth login.' }
$env:GH_TOKEN = $token

git push origin HEAD
if ($LASTEXITCODE) { throw 'git push ha fallado.' }
# La etiqueta y la release se crean antes: GitHub no deja crear una release publicada sin etiqueta
# (422), y electron-builder sube el instalador y el blockmap a la vez y los dos intentaban crear la
# release (422 already_exists). Con la release ya creada, electron-builder solo sube los archivos
git tag "v$version"
git push origin "v$version"
if ($LASTEXITCODE) { throw 'No se pudo subir la etiqueta.' }
gh release create "v$version" --title $version --notes "LoL Coach $version" --verify-tag
if ($LASTEXITCODE) { throw 'No se pudo crear la release en GitHub.' }

# Instalador + latest.yml (lo que lee el actualizador) subidos a la release v<version>
npx electron-builder --win nsis --publish always
if ($LASTEXITCODE) {
  # Por si falla la subida por la red: un reintento
  Write-Host 'Reintentando la subida...'
  npx electron-builder --win nsis --publish always
  if ($LASTEXITCODE) { throw 'electron-builder ha fallado.' }
}

git fetch --tags --quiet
Write-Host "Publicada la v$version"
