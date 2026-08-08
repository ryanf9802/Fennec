@echo off
setlocal
title Fennec Developer Console
cd /d "%~dp0"

echo Starting Fennec in developer mode...
echo Keep this window open while Fennec is running.
echo.

Fennec.exe --dev
set "FENNEC_EXIT=%ERRORLEVEL%"

echo.
echo Fennec exited with code %FENNEC_EXIT%.
echo Copy this console output when reporting a startup problem.
pause
exit /b %FENNEC_EXIT%
