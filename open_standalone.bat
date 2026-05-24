@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PY_CMD=py -m http.server 8080"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python not found. Install Python 3 or run this file through a local web server.
    pause
    exit /b 1
  )
  set "PY_CMD=python -m http.server 8080"
)

echo Opening http://localhost:8080/standalone.html
start "" http://localhost:8080/standalone.html
%PY_CMD%
