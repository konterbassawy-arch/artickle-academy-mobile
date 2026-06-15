#!/bin/bash

# ARTickle Academy Manager - Quick Deployment Script
# This script automates the deployment process to Firebase

set -e  # Exit on error

echo "================================"
echo "ARTickle Academy Manager"
echo "Firebase Deployment Script"
echo "================================"
echo ""

# Step 1: Check if Node.js is installed
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

# Step 2: Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "⚠️  Firebase CLI not found. Installing globally..."
    npm install -g firebase-tools
fi
echo "✅ Firebase CLI found: $(firebase --version)"

# Step 3: Install dependencies
echo ""
echo "📦 Installing project dependencies..."
npm install
echo "✅ Dependencies installed"

# Step 4: Build the project
echo ""
echo "🔨 Building project for production..."
npm run build
echo "✅ Build complete"

# Step 5: Check if user is logged in to Firebase
echo ""
echo "🔐 Checking Firebase authentication..."
if ! firebase projects:list > /dev/null 2>&1; then
    echo "⚠️  Not authenticated with Firebase. Starting login..."
    firebase login
fi
echo "✅ Firebase authentication verified"

# Step 6: Deploy to Firebase
echo ""
echo "🚀 Deploying to Firebase..."
firebase deploy

echo ""
echo "================================"
echo "✅ Deployment Complete!"
echo "================================"
echo ""
echo "Your application is now live at:"
echo "🌐 https://artickle-academy.web.app"
echo ""
echo "Project Console:"
echo "📊 https://console.firebase.google.com/project/artickle-academy/overview"
echo ""
