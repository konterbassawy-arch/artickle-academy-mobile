/**
 * PlaceholderPage — Phase 8
 *
 * Generic "Coming Soon" placeholder for portals not yet implemented.
 * Used for Parent (Phase 11), Student (Phase 11), and School Admin (Phase 12).
 */

import React from 'react';

interface PlaceholderPageProps {
  portalName: string;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ portalName }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">
        {portalName} Portal
      </h2>
      <p className="text-slate-400 text-sm max-w-md">
        This section is coming soon. The {portalName.toLowerCase()} portal is planned for a future phase.
      </p>
    </div>
  );
};

export default PlaceholderPage;
