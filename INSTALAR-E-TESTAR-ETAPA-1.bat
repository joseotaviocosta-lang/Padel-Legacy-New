@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =============================================
echo PADEL LEGACY - ETAPA 1 OFFLINE
 echo =============================================
echo.
echo Encerrando processos antigos na porta 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

echo Instalando dependencias locais...
call npm install
if errorlevel 1 goto erro

echo.
echo Abrindo o aplicativo em modo de desenvolvimento...
call npm run app:dev
if errorlevel 1 goto erro
exit /b 0
:erro
echo.
echo ERRO: o processo foi interrompido. Copie a mensagem acima e envie para analise.
pause
exit /b 1
