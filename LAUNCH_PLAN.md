# 🚀 Launch Plan — getting ARTickle Academy into the App Store + Google Play

Click-by-click runbook. We work through this **one step at a time**. Legend:
**[You]** = you click · **[Me]** = Claude does it · **[Us]** = together.

> Status keys: ⬜ not started · 🟡 in progress · ✅ done

---

## Stage 1 — Start the slow approvals (do first; they run in the background)

### Step 1 — Apple Developer Program  **[You]** ⬜  (~$99/yr, 1–2 day approval)
1. On a Mac or iPhone, open **developer.apple.com** → top-right **Account**.
2. Sign in with the **Apple ID that should own the app** (your business email is fine).
3. Click **Enroll** → **Start Your Enrollment**.
4. **Entity type** — pick one:
   - **Individual / Sole Proprietor** → fastest; the *seller name* shown on the store is your
     personal name. ← recommended to move fast.
   - **Company/Organization** → shows your business name, but needs a free **D‑U‑N‑S number**
     (can add days). Choose this only if the business name must appear as the seller.
5. Confirm your details, accept the agreement, **pay $99**.
6. You'll get an approval email in ~1–2 days. ✅ when approved.

### Step 2 — Google Play Developer account  **[You]** ⬜  ($25 one-time)
1. Go to **play.google.com/console** → sign in with your Google account.
2. Choose account type (Personal is fine to start), pay **$25**, verify identity.
3. Usually approved within hours–2 days. ✅ when approved.

---

## Stage 2 — Connect the app to Firebase (we can do this today)

### Step 3 — Register the apps in Firebase  **[You] → [Me]** ⬜
1. **console.firebase.google.com** → open the **articklebeta** project.
2. ⚙️ → **Project settings** → **Your apps** → **Add app**.
3. Add **Android**: package name **`com.artickle.academy`** → download **`google-services.json`**.
4. Add **iOS**: bundle ID **`com.artickle.academy`** → download **`GoogleService-Info.plist`**.
5. Authentication → **Sign-in method** → make sure **Google** is enabled (Apple later).
6. **Send me both files** → I install them and wire the native config. **[Me]**

### Step 4 — Wire the config + native auth  **[Me]** ⬜ (after Step 3 files arrive)

### Step 5 — Android SHA fingerprints  **[You, I give the exact command]** ⬜
(Comes when Android Studio is installed — needed for Google login on Android.)

---

## Stage 3 — Legal & privacy (I draft today)

### Step 6 — Privacy policy  **[Me drafts] → [You publish]** ⬜
- I write the policy → we host it at a public URL (can live on Firebase Hosting).

---

## Stage 4 — Build the app (needs a Mac with Xcode + Android Studio)

### Step 7 — Install build tools  **[You]** ⬜
- **Xcode** (Mac App Store) + **Android Studio**.

### Step 8 — Build & test on simulator  **[Us]** ⬜
- `npm run build && npx cap sync`, open in Xcode / Android Studio, run, verify login + delete.

### Step 9 — Finish Sign in with Apple  **[You, I guide]** ⬜
- Enable the **Sign in with Apple** capability in Xcode + create the **Services ID/key** in the
  Apple portal, add the key to Firebase.

---

## Stage 5 — Store listing & submit

### Step 10 — Listing assets  **[Us]** ⬜
- Name, subtitle, description, keywords, category; **screenshots** + Google **feature graphic**.

### Step 11 — Privacy forms & ratings  **[You, I guide]** ⬜
- Apple Privacy "nutrition label", Google Data Safety form, content/age rating.

### Step 12 — Submit  **[You, I guide]** ⬜
- iOS: archive in Xcode → App Store Connect → TestFlight → submit.
- Android: build **AAB** → Play Console internal track → submit.

---

## Right now we can do, with no waiting:
- **Step 1 + 2** — you start the account enrollments (slow clock).
- **Step 3** — you register the Firebase apps + send me the files.
- **Step 6** — I draft your privacy policy.
