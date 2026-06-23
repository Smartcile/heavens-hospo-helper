@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "rebuild.ps1"
pause
