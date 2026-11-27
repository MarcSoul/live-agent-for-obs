@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0server.mjs"
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 24 y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
node server.mjs
pause
