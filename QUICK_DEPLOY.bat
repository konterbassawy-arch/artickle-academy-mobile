@echo off
REM ARTickle Academy Manager - Quick Deployment Script for Windows
REM This script automates the deployment process to Firebase

setlocal enabledelayedexpansion

echo ================================
echo ARTickle Academy Manager
echo Firebase Deployment Script
echo ================================
echo.

REM Step 1: Check if Node.js is installed
echo 📋 Checking prerequisites...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js found: %NODE_VERSION%

REM Step 2: Check if Firebase CLI is installed
where firebase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Firebase CLI not found. Installing globally...
    call npm install -g firebase-tools
)
for /f "tokens=*" %%i in ('firebase --version') do set FIREBASE_VERSION=%%i
echo ✅ Firebase CLI found: %FIREBASE_VERSION%

REM Step 3: Install dependencies
echo.
echo 📦 Installing project dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed

REM Step 4: Build the project
echo.
echo 🔨 Building project for production...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Build failed
    pause
    exit /b 1
)
echo ✅ Build complete

REM Step 5: Check if user is logged in to Firebase
echo.
echo 🔐 Checking Firebase authentication...
call firebase projects:list >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Not authenticated with Firebase. Starting login...
    call firebase login
)
echo ✅ Firebase authentication verified

REM Step 6: Deploy to Firebase
echo.
echo 🚀 Deploying to Firebase...
call firebase deploy

echo.
echo ================================
echo ✅ Deployment Complete!
echo ================================
echo.
echo Your application is now live at:
echo 🌐 https://artickle-academy.web.app
echo.
echo Project Console:
echo 📊 https://console.firebase.google.com/project/artickle-academy/overview
echo.
pause
