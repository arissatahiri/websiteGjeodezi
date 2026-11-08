@echo off
cd /d "%~dp0"
title Gjeodeti I.T - Admin Server
set NODE=tools\node\node.exe
set NPM=tools\node\npm.cmd

if not exist "%NODE%" (
  echo Node portable mungon. Instalo Node.js ose ekzekuto setup-in e tools\node.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Duke instaluar varësité...
  call "%NPM%" install --omit=dev
)

echo Nis serverin ne http://127.0.0.1:3000/
echo Admin: http://127.0.0.1:3000/admin/
"%NODE%" server\index.js
pause
