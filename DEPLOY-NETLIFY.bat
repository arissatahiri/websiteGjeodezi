@echo off
cd /d "%~dp0"
title Deploy Gjeodeti → Netlify
echo.
echo  Deploy ne Netlify (site + Functions/API)
echo.

if not exist "tools\node\node.exe" (
  echo Node portable mungon.
  pause
  exit /b 1
)

echo [1] npm install...
call "tools\node\npm.cmd" install --omit=dev
if errorlevel 1 goto fail

echo [2] netlify-cli...
call "tools\node\npm.cmd" install netlify-cli --no-save --no-fund --no-audit
if errorlevel 1 goto fail

echo [3] Login Netlify (hapet browser nese duhet)...
call "tools\node\npx.cmd" netlify status
if errorlevel 1 (
  call "tools\node\npx.cmd" netlify login
)

echo [4] Link site (ibrahimtahiri) nese nuk eshte...
if not exist ".netlify\state.json" (
  call "tools\node\npx.cmd" netlify link
)

echo [5] Deploy PRODUCTION...
call "tools\node\npx.cmd" netlify deploy --prod --build
if errorlevel 1 goto fail

echo.
echo  GATI. Testo:
echo   https://ibrahimtahiri.netlify.app/api/health
echo   https://ibrahimtahiri.netlify.app/admin/
echo.
pause
exit /b 0

:fail
echo.
echo  Deploy deshtoi. Shiko mesazhin me siper.
pause
exit /b 1
