@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TARGET=%CD%\src\local\localDatabase.js"
set "SOURCE=%CD%\hotfix\src\local\localDatabase.js"

if not exist "%TARGET%" (
  echo.
  echo ERRO: Nao encontrei src\local\localDatabase.js
  echo Extraia este ZIP dentro da pasta raiz do projeto.
  echo A pasta deve conter package.json e a pasta src.
  echo.
  pause
  exit /b 1
)

if not exist "%SOURCE%" (
  echo ERRO: O arquivo corrigido do hotfix nao foi encontrado.
  pause
  exit /b 1
)

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "D=%%d%%c%%b"
for /f "tokens=1-3 delims=:,. " %%a in ("%time%") do set "T=%%a%%b%%c"
set "T=%T: =0%"
set "BACKUP=%CD%\backup-hotfix-persistencia-%D%-%T%"

mkdir "%BACKUP%" >nul 2>&1
copy /y "%TARGET%" "%BACKUP%\localDatabase.js" >nul
if errorlevel 1 (
  echo ERRO: Nao foi possivel criar o backup.
  pause
  exit /b 1
)

copy /y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 (
  echo ERRO: Nao foi possivel atualizar o arquivo.
  echo O original continua no backup: %BACKUP%
  pause
  exit /b 1
)

findstr /c:"FULL_MIRROR_KEY" "%TARGET%" >nul || goto validation_error
findstr /c:"saveFullMirrorSync" "%TARGET%" >nul || goto validation_error
findstr /c:"restaurando o espelho completo" "%TARGET%" >nul || goto validation_error
findstr /c:"bloqueada para proteger seus dados" "%TARGET%" >nul || goto validation_error

echo.
echo ===============================================
echo HOTFIX APLICADO COM SUCESSO
echo ===============================================
echo.
echo Arquivo atualizado:
echo %TARGET%
echo.
echo Backup do arquivo anterior:
echo %BACKUP%
echo.
echo Agora execute: npm run dev
echo.
pause
exit /b 0

:validation_error
echo.
echo ERRO: A validacao do arquivo atualizado falhou.
echo O original esta preservado em:
echo %BACKUP%
echo.
pause
exit /b 1
