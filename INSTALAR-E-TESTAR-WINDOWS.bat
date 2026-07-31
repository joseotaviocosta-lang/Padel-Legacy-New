@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   PADEL LEGACY APP WINDOWS - PREPARACAO
 echo ==============================================
where node >nul 2>nul || (echo ERRO: instale Node.js LTS e tente novamente.& pause & exit /b 1)
where cargo >nul 2>nul || (echo ERRO: instale Rust pelo rustup e tente novamente.& echo Veja o LEIA-ME-APP.txt.& pause & exit /b 1)
echo.
echo [1/2] Instalando dependencias...
call npm install
if errorlevel 1 (echo ERRO no npm install.& pause & exit /b 1)
echo.
echo [2/2] Abrindo o aplicativo em modo de teste...
call npm run app:dev
pause
