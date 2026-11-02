@echo off
REM Wrapper so the script runs even when PowerShell script execution is disabled.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-local.ps1" %*
