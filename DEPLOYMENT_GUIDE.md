# ARTickle Academy Manager - Deployment Guide

## Project Information

**Project Name:** artickle-academy  
**Project ID:** artickle-academy  
**Project Number:** 1067081921044  
**Support Email:** konterbassawy@gmail.com  
**Public-facing Name:** project-1067081921044

---

## Prerequisites

Before deploying, ensure you have the following installed on your machine:

1. **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
2. **Firebase CLI** - Install globally:
   ```bash
   npm install -g firebase-tools
   ```

---

## Step 1: Prepare Your Local Environment

### 1.1 Clone or Extract the Project

Extract the `articklebeta-fixed.zip` file to your desired location:

```bash
unzip articklebeta-fixed.zip
cd articklebeta-fixed
```

### 1.2 Install Dependencies

Install all project dependencies:

```bash
npm install
```

---

## Step 2: Verify Firebase Configuration

The Firebase configuration has been pre-configured with your credentials:

**Firebase Config (in `context/AppContext.tsx`):**
```javascript
const firebaseConfig = {
  apiKey: 'AIzaSyAVW29VhiKWAocim1dP_B3EBFaqEbmFxBQ',
  authDomain: 'artickle-academy.firebaseapp.com',
  projectId: 'artickle-academy',
  storageBucket: 'artickle-academy.firebasestorage.app',
  messagingSenderId: '1067081921044',
  appId: '1:1067081921044:web:aaa254f1f45e3d1bcaed01'
};
```

**Firebase Project File (`.firebaserc`):**
```json
{
  "projects": {
    "default": "artickle-academy"
  }
}
```

---

## Step 3: Build the Project

Build the application for production:

```bash
npm run build
```

This will create a `dist/` folder with the optimized production build.

**Expected Output:**
```
✓ 46 modules transformed.
dist/index.html                  1.76 kB │ gzip:  0.80 kB
dist/assets/index-*.js          ~301 kB │ gzip: ~86 kB
✓ built in ~1.50s
```

---

## Step 4: Authenticate with Firebase

### Option A: Interactive Login (Recommended for First-Time Setup)

```bash
firebase login
```

This will open a browser window to authenticate with your Google account associated with the Firebase project.

### Option B: Using CI Token (For Automated Deployments)

If you have a Firebase CI token, use:

```bash
firebase deploy --token "YOUR_CI_TOKEN_HERE"
```

---

## Step 5: Deploy to Firebase

Deploy the application to your Firebase Hosting:

```bash
firebase deploy
```

**Expected Output:**
```
=== Deploying to 'artickle-academy'...

i  deploying hosting
i  hosting[artickle-academy]: beginning deploy...
i  hosting[artickle-academy]: found 3 files, uploading 3
✔  hosting[artickle-academy]: file upload complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/artickle-academy/overview
Hosting URL: https://artickle-academy.web.app
```

---

## Step 6: Access Your Deployed Application

After successful deployment, your application will be available at:

**Primary URL:** `https://artickle-academy.web.app`  
**Alternative URL:** `https://project-1067081921044.web.app`

---

## Configuration Page Features

The deployed application includes a fully functional Configuration page with three main sections:

### 1. Schools Management
- Add new schools with individual and group rates
- Edit school details and minimum guarantee hours by instrument
- Delete schools
- View and manage per-school configurations

### 2. User Authorization
- Authorize new teachers and administrators
- Edit user details and teacher-specific settings
- Configure per-school rate overrides for teachers
- Set minimum daily guarantee hours by instrument
- Delete user accounts

### 3. Student Directory
- Add new students with school and teacher assignments
- Search and filter students by name, school, teacher, or instrument
- Edit student information
- Delete student records
- Import students from Excel/CSV files
- Export student data to CSV format

---

## Troubleshooting

### Issue: "Cannot find module 'firebase-tools'"

**Solution:** Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

### Issue: "Authentication failed"

**Solution:** Re-authenticate with Firebase:
```bash
firebase logout
firebase login
```

### Issue: "Permission denied" error during deployment

**Solution:** Ensure your Google account has the necessary permissions on the Firebase project. Contact your project administrator if needed.

### Issue: "dist folder not found"

**Solution:** Run the build command first:
```bash
npm run build
```

### Issue: Application not loading after deployment

**Solution:** Check the Firebase Hosting logs:
```bash
firebase hosting:channel:list
firebase hosting:channel:open [CHANNEL_NAME]
```

---

## Environment Variables

The project uses the following environment variable (optional):

**`.env.local`:**
```
GEMINI_API_KEY=PLACEHOLDER_API_KEY
```

If you need to use Gemini API features, replace `PLACEHOLDER_API_KEY` with your actual API key.

---

## Project Structure

```
articklebeta-fixed/
├── context/
│   └── AppContext.tsx          # Firebase config & app state
├── pages/
│   ├── Configuration.tsx       # ✅ FIXED - Configuration page
│   ├── Dashboard.tsx
│   ├── Financials.tsx
│   ├── LessonLog.tsx
│   ├── Attendance.tsx
│   ├── MyStudents.tsx
│   └── TeacherFinance.tsx
├── components/
│   ├── ImportResultsModal.tsx
│   ├── EditLessonModal.tsx
│   ├── Login.tsx
│   └── Sidebar.tsx
├── services/
│   ├── exportUtils.ts
│   ├── importUtils.ts
│   ├── excelExport.ts
│   └── dataGenerator.ts
├── dist/                       # Production build (created after npm run build)
├── firebase.json               # Firebase Hosting config
├── .firebaserc                 # Firebase project reference
├── vite.config.ts              # Vite build configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Project dependencies
```

---

## Key Fixes Applied

✅ **Configuration Page (Line 611):** Fixed JSX formatting issue with empty state check  
✅ **Firebase Configuration:** Updated to use artickle-academy project credentials  
✅ **Project References:** Updated `.firebaserc` to point to artickle-academy  
✅ **Build Optimization:** Production build successfully created  

---

## Support & Maintenance

**Project Console:** https://console.firebase.google.com/project/artickle-academy/overview  
**Support Email:** konterbassawy@gmail.com  

For issues or questions about the deployment, refer to:
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

---

## Next Steps

1. ✅ Extract the project
2. ✅ Install dependencies (`npm install`)
3. ✅ Build the project (`npm run build`)
4. ✅ Authenticate with Firebase (`firebase login`)
5. ✅ Deploy to Firebase (`firebase deploy`)
6. ✅ Access your app at `https://artickle-academy.web.app`

Happy deploying! 🚀
