@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Gerando instalador do Padel Legacy...
call npm install
if errorlevel 1 (pause & exit /b 1)
call npm run app:build
if errorlevel 1 (pause & exit /b 1)
echo.
echo PRONTO. Procure o instalador em:
echo src-tauri\target\release\bundle
pause
