# Programa de fondo de mains (scripts/mains-worker.js) en el inicio de Windows, sin ventana.
#   install    lo pone en la carpeta Inicio y lo arranca ya
#   uninstall  lo quita de Inicio y lo para
#   status     dice si esta en marcha y cuanto lleva
param([ValidateSet('install', 'uninstall', 'status')][string]$Action = 'status')

$root = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $root 'scripts\mains-worker.js'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'LoL Coach - Mains.vbs'
$lock = Join-Path $env:APPDATA 'LoL Coach\cache\mains\.worker.lock'

function Get-WorkerPid {
  if (-not (Test-Path $lock)) { return $null }
  try {
    $l = Get-Content $lock -Raw | ConvertFrom-Json
    $p = Get-Process -Id $l.pid -ErrorAction Stop
    if ($p.ProcessName -eq 'node') { return $l.pid }
  } catch { }
  return $null
}

switch ($Action) {
  'install' {
    $node = (Get-Command node -ErrorAction Stop).Source
    # wscript lanza node sin ventana (0) y sin esperar (False)
    $vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$root"
sh.Run """$node"" ""$worker""", 0, False
"@
    Set-Content -Path $startup -Value $vbs -Encoding ASCII
    if (Get-WorkerPid) { Write-Output 'Ya estaba en marcha.' }
    else { Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$startup`""; Write-Output 'Arrancado.' }
    Write-Output "Se iniciara solo al entrar en Windows ($startup)."
  }
  'uninstall' {
    Remove-Item $startup -ErrorAction SilentlyContinue
    $workerPid = Get-WorkerPid
    if ($workerPid) { Stop-Process -Id $workerPid -Confirm:$false; Write-Output "Parado (pid $workerPid)." }
    Write-Output 'Quitado del inicio de Windows.'
  }
  'status' {
    $workerPid = Get-WorkerPid
    Write-Output ("En marcha: " + $(if ($workerPid) { "si (pid $workerPid)" } else { 'no' }))
    Write-Output ("En el inicio de Windows: " + $(if (Test-Path $startup) { 'si' } else { 'no' }))
    Get-Content (Join-Path $env:APPDATA 'LoL Coach\log.txt') -ErrorAction SilentlyContinue | Select-String 'otp:' | Select-Object -Last 5 | ForEach-Object { $_.Line }
  }
}
