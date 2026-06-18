# Native Google / Apple sign-in — setup checklist

The **app code** for native Google login (and the account-deletion re-confirm) is done and
committed. Google's web popup doesn't work inside a packaged app, so on a device the app uses
the `@capacitor-firebase/authentication` plugin to sign in natively, then signs into Firebase.

The **web** version (`articklebeta.web.app`) is unaffected and keeps using the popup.

To make native sign-in actually work on a phone, the steps below remain. Legend: **[You]** =
needs your Firebase console / accounts · **[Claude]** = I can do it once the inputs exist.

> Everything here targets the **dev** project `articklebeta`. The same steps repeat for the
> production project when the app points at it for launch.

## 1. Register the apps in Firebase  **[You]**
In the Firebase console → `articklebeta` → Project settings → *Your apps*:
- Add an **Android app** with package name **`com.artickle.academy`**.
- Add an **iOS app** with bundle ID **`com.artickle.academy`**.
- Make sure **Google** (and later **Apple**) are enabled under Authentication → Sign-in method.

## 2. Download the config files  **[You]** → hand to **[Claude]**
- Android: download **`google-services.json`** → it goes in `android/app/`.
- iOS: download **`GoogleService-Info.plist`** → it goes in `ios/App/App/`.

These are not secrets in the usual sense but are project-specific; just send them to me and
I'll place them and wire the native config (Gradle + Info.plist URL scheme) in step 3.

## 3. Native wiring  **[Claude]** (after step 2)
- Android: add the Google-services Gradle plugin + Firebase BoM (per plugin docs).
- iOS: add the reversed-client-ID URL scheme to `Info.plist`.

## 4. SHA fingerprints (Android Google sign-in)  **[You]** (I provide the commands)
Google sign-in on Android requires the app's signing-certificate fingerprints registered in
Firebase (console → Android app → *Add fingerprint*):
- **Debug** SHA-1/SHA-256 — for testing.
- **Release** SHA-1/SHA-256 — for the store build (comes from the release keystore in Phase E).

## 5. Build & test  **[You + Claude]**
Needs **Xcode** (iOS) / **Android Studio** (Android) installed — not available in the current
dev environment. Then:
- `npm run build && npx cap sync`
- Open `ios/App` in Xcode or `android/` in Android Studio and run on a simulator/device.
- Verify: Google sign-in sheet appears natively, login works, and Delete Account → Google
  re-confirm works.

## Sign in with Apple
**Code + UI are done** — a "Sign in with Apple" button shows on the iOS build (hidden on web /
Android), wired to the native Apple sheet via the same plugin (`loginWithApple` in AppContext).

To make it run on a device it still needs **[You]**, once the Apple Developer account is active:
- In Xcode, enable the **Sign in with Apple** capability on the App target.
- In the Apple Developer portal, enable Sign in with Apple for the App ID, and create the
  **Services ID** + key; add the key to Firebase console → Authentication → Apple provider.
- Then build & test on an iOS device/simulator (Xcode required — not available here).
