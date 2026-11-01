@echo off
rem Abre LoL Coach sin ventana de consola
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
