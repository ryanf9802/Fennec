@echo off
setlocal
cd /d "%~dp0"

echo Starting Fennec web developer mode...
echo Keep this window open while Fennec is running.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 24 or newer is required.
  echo Download it from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

set "FENNEC_PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo ERROR: pnpm is not installed and Corepack is unavailable.
    echo Install pnpm from https://pnpm.io/installation
    echo.
    pause
    exit /b 1
  )
  set "FENNEC_PNPM=corepack pnpm"
)

echo Checking dependencies...
call %FENNEC_PNPM% install --frozen-lockfile
if errorlevel 1 goto :failed

echo Opening http://localhost:5173
echo.
call %FENNEC_PNPM% dev --open
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Fennec developer mode exited with code %errorlevel%.
echo Copy this console output when reporting a problem.
pause
exit /b %errorlevel%
