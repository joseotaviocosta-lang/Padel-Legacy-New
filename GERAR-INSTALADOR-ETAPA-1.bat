@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Gerando o Padel Legacy offline em modo Release...
call npm install
if errorlevel 1 goto erro
call npm run app:build
if errorlevel 1 goto erro
echo.
echo Instalador criado em: src-tauri\target\release\bundle
pause
exit /b 0
:erro
echo Falha ao gerar o instalador.
pause
exit /b 1
