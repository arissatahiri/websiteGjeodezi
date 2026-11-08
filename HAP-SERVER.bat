@echo off
cd /d "%~dp0"
title Gjeodeti I.T - Server + Admin
color 0B
echo.
echo  ========================================
echo   Gjeodeti I.T  —  Website + Admin API
echo  ========================================
echo.

set PORT=3000
set HOST=0.0.0.0
set DB_HOST=127.0.0.1
set DB_USER=root
set DB_PASS=
set DB_NAME=gjeodeti

echo  [1/3] MySQL / XAMPP...
netstat -ano | findstr ":3306" | findstr LISTENING >nul
if errorlevel 1 (
  echo  MySQL nuk eshte aktiv. Duke u perpjekur ta nise...
  if exist "C:\xampp\mysql_start.bat" (
    start "" "C:\xampp\mysql_start.bat"
    timeout /t 5 /nobreak >nul
  ) else (
    echo  HAP XAMPP Control Panel dhe Start MySQL, pastaj ristarto kete file.
    pause
    exit /b 1
  )
)
netstat -ano | findstr ":3306" | findstr LISTENING >nul
if errorlevel 1 (
  echo  MySQL ende nuk eshte aktiv. Hap XAMPP -^> Start MySQL.
  pause
  exit /b 1
)
echo  MySQL OK
echo.

echo  [2/3] Porta %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo  Duke ndalur procesin e vjeter PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo.

set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=1" %%b in ("%%a") do (
    echo %%b | findstr /b "192.168." >nul && set "IP=%%b"
  )
)

if not exist "tools\node\node.exe" (
  echo  Node portable nuk u gjet ne tools\node\
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo  Duke instaluar varesite...
  call "tools\node\npm.cmd" install --omit=dev
)
if not exist "node_modules\mysql2" (
  echo  Duke instaluar mysql2...
  call "tools\node\npm.cmd" install mysql2 --omit=dev
)

echo  [3/3] Nisja e serverit...
echo.
echo  ----------------------------------------
echo   Website:  http://127.0.0.1:%PORT%/
echo   Admin:    http://127.0.0.1:%PORT%/admin/
if defined IP echo   Telefon:  http://%IP%:%PORT%/
echo   DB:       MySQL / %DB_NAME%
echo  ----------------------------------------
echo.
echo  Mbaje kete dritare HAPUR.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%/admin/"

"tools\node\node.exe" server\index.js
echo.
echo  Serveri u ndal.
pause
