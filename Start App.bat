@echo off
title Glorious Public School Tracker (English Medium)
echo =======================================================
echo    Starting GPS Student Tracker (English Medium)
echo =======================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if port 5001 is already in use
netstat -ano | findstr :5001 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo [OK] Backend server is already running on port 5001.
) else (
    echo [*] Launching Node.js Backend Server on port 5001...
    start /min "GPS EM Server" node server.js
    timeout /t 2 /nobreak >nul
)

:: Open the complete app in the default web browser
echo [*] Opening Web Application in your browser...
start http://localhost:5001

echo.
echo =======================================================
echo [SUCCESS] Glorious Student Tracker (English Medium) is Active!
echo  - PC Browser:          http://localhost:5001
echo  - MongoDB Database:    gps_english_medium
echo =======================================================
timeout /t 3 >nul
exit /b 0

