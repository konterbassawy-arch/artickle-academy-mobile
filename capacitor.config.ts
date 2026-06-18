import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle identifier used by both stores. Matches the publishing checklist.
  appId: 'com.artickle.academy',
  // Display name under the icon. Shown on the device home screen.
  appName: 'ARTickle Academy',
  // Capacitor loads the bundled Vite build from here (no network needed at startup).
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // We obtain a credential natively and sign in via the Firebase JS SDK ourselves
      // (keeps the app's existing onAuthStateChanged flow), so skip the plugin's own
      // native Firebase sign-in. Providers enabled for the native sign-in sheets.
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
  },
};

export default config;
