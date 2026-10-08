@echo off
title Glorious Public School - Student Tracker
cd /d "%~dp0"
echo =======================================================
echo    Starting Glorious Public School - Student Tracker
echo =======================================================
echo.

:: Node.js 22 or newer is needed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install the LTS version from https://nodejs.org and run this again.
    pause
    exit /b 1
)

:: Install or update the app's parts the first time (or after an update)
set NEED_INSTALL=0
if not exist "node_modules\jspdf" set NEED_INSTALL=1
if not exist "node_modules\@fontsource\plus-jakarta-sans" set NEED_INSTALL=1
if not exist "node_modules\chart.js" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
    echo [*] Installing the app for the first time. This needs internet and takes a minute...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] Installation failed. Check the internet connection and try again.
        pause
        exit /b 1
    )
)

:: Start the server unless it is already running
netstat -ano | findstr :5001 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo [OK] The app is already running.
) else (
    echo [*] Starting the app...
    start /min "School Tracker Server" node server.js
    timeout /t 3 /nobreak >nul
)

echo [*] Opening the app in your browser...
start http://localhost:5001

echo.
echo =======================================================
echo  The app is open at http://localhost:5001
echo  Other phones and computers on the school Wi-Fi can use
echo  the "On school Wi-Fi" address shown in the server window.
echo  Keep the small server window open while the app is in use.
echo =======================================================
timeout /t 5 >nul
exit /b 0
