import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle identifier used by both stores. Matches the publishing checklist.
  appId: 'com.artickle.academy',
  // Display name under the icon. Shown on the device home screen.
  appName: 'ARTickle Academy',
  // Capacitor loads the bundled Vite build from here (no network needed at startup).
  webDir: 'dist',
};

export default config;
