@echo off
:: Hap portin 3000 që telefoni (Safari/Chrome) të hyjë te Admin
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Duhet "Run as administrator".
  echo  Right-click kete file -^> Run as administrator
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Gjeodeti Admin 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Gjeodeti Admin 3000" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
if errorlevel 1 (
  echo  Deshtoi. Provo Windows Security -^> Firewall -^> Allow an app.
  pause
  exit /b 1
)

echo.
echo  OK — porta 3000 u hap per telefon.
echo  Ne Safari hap: http://192.168.1.8:3000/admin/
echo  (WiFi i njejte + HAP-SERVER.bat aktiv)
echo.
pause
