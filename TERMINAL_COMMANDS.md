# Terminal Deployment Commands

## Quick Reference for Terminal/Command Line Deployment

Use these commands to deploy your ARTickle Academy Manager application to Firebase from your terminal.

---

## Prerequisites Check

Verify that you have the required tools installed:

```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Verify Firebase CLI installation
firebase --version
```

---

## Step-by-Step Deployment Commands

### 1. Navigate to Project Directory

```bash
cd /path/to/articklebeta-fixed
```

Replace `/path/to/articklebeta-fixed` with the actual path where you extracted the project.

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages listed in `package.json`.

### 3. Build for Production

```bash
npm run build
```

Creates an optimized production build in the `dist/` folder.

### 4. Authenticate with Firebase

**First time setup (interactive login):**

```bash
firebase login
```

This opens a browser window for authentication.

**Or, if you have a CI token:**

```bash
firebase deploy --token "YOUR_CI_TOKEN_HERE"
```

### 5. Deploy to Firebase

```bash
firebase deploy
```

This deploys your application to Firebase Hosting.

---

## All-in-One Command

If you want to run all steps in sequence, use this single command:

```bash
npm install && npm run build && firebase login && firebase deploy
```

Or without the interactive login (if already authenticated):

```bash
npm install && npm run build && firebase deploy
```

---

## Automated Deployment Scripts

### For macOS/Linux Users

Run the automated deployment script:

```bash
./QUICK_DEPLOY.sh
```

This script will:
- Check for Node.js and Firebase CLI
- Install dependencies
- Build the project
- Authenticate with Firebase (if needed)
- Deploy to Firebase

### For Windows Users

Run the batch file:

```bash
QUICK_DEPLOY.bat
```

Or double-click `QUICK_DEPLOY.bat` in File Explorer.

---

## Verify Deployment

After deployment completes, verify your application:

### Check Deployment Status

```bash
firebase hosting:channel:list
```

### View Deployment Logs

```bash
firebase functions:log
```

### Open Your Application

Your app is now live at:
- **Primary URL:** `https://artickle-academy.web.app`
- **Alternative URL:** `https://project-1067081921044.web.app`

---

## Useful Firebase CLI Commands

### List All Projects

```bash
firebase projects:list
```

### Switch Between Projects

```bash
firebase use artickle-academy
```

### View Hosting Configuration

```bash
firebase hosting:sites:list
```

### Deploy Only Hosting (Skip Firestore Rules)

```bash
firebase deploy --only hosting
```

### Deploy Only Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Create a Preview Channel

```bash
firebase hosting:channel:create preview
firebase deploy --only hosting:preview
```

### Delete a Preview Channel

```bash
firebase hosting:channel:delete preview
```

### Logout from Firebase

```bash
firebase logout
```

---

## Troubleshooting Commands

### Clear npm Cache

```bash
npm cache clean --force
```

### Reinstall Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

### Check Firebase Configuration

```bash
firebase projects:list
firebase use --add
```

### View Real-time Logs

```bash
firebase functions:log --limit 50
```

### Rollback to Previous Deployment

```bash
firebase hosting:releases:list
firebase hosting:releases:rollback [RELEASE_ID]
```

---

## Environment Variables

If you need to set environment variables for the build:

### macOS/Linux

```bash
export GEMINI_API_KEY="your_api_key_here"
npm run build
```

### Windows (Command Prompt)

```bash
set GEMINI_API_KEY=your_api_key_here
npm run build
```

### Windows (PowerShell)

```powershell
$env:GEMINI_API_KEY="your_api_key_here"
npm run build
```

---

## Firebase Project Details

**Project Name:** artickle-academy  
**Project ID:** artickle-academy  
**Project Number:** 1067081921044  
**Hosting URL:** https://artickle-academy.web.app  
**Console URL:** https://console.firebase.google.com/project/artickle-academy/overview  

---

## Common Issues & Solutions

### Issue: "firebase: command not found"

**Solution:**
```bash
npm install -g firebase-tools
```

### Issue: "Permission denied" on macOS/Linux

**Solution:**
```bash
sudo npm install -g firebase-tools
```

### Issue: "Cannot find module" error

**Solution:**
```bash
npm install
npm run build
```

### Issue: Build fails with TypeScript errors

**Solution:**
```bash
npm install
npm run build -- --force
```

### Issue: Deployment fails with authentication error

**Solution:**
```bash
firebase logout
firebase login
firebase deploy
```

---

## Getting Help

For more information about Firebase CLI commands:

```bash
firebase help
firebase deploy --help
firebase hosting --help
```

Or visit the official documentation:
- [Firebase CLI Documentation](https://firebase.google.com/docs/cli)
- [Firebase Hosting Guide](https://firebase.google.com/docs/hosting)

---

## Success Indicators

After running `firebase deploy`, you should see:

```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/artickle-academy/overview
Hosting URL: https://artickle-academy.web.app
```

Your application is now live and accessible at the Hosting URL! 🎉
