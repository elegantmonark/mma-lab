@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm not found. Install Node.js LTS first: https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Striking Lab at http://localhost:5173
call npm run dev
