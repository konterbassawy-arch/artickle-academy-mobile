import React from 'react';

/**
 * Persistent visual marker for any NON-production environment, so this dev/test app can never
 * be confused with the live app. It auto-hides when the app is pointed at the production
 * project (`artickle-academy`), so the real app never shows it.
 *
 * Rendered at the top level (index.tsx), outside the router, so it appears on every screen
 * including the login page. `pointer-events-none` ensures it never blocks clicks.
 */
export const DevBanner: React.FC = () => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  // Never show on production.
  if (!projectId || projectId === 'artickle-academy') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[99999]"
      style={{ pointerEvents: 'none' }}
    >
      <div className="px-3 py-0.5 rounded-b-md bg-amber-400 text-amber-950 text-[11px] font-extrabold uppercase tracking-widest shadow-lg shadow-black/40 whitespace-nowrap">
        ⚠ Dev · Test App — not live · {projectId}
      </div>
    </div>
  );
};

export default DevBanner;
