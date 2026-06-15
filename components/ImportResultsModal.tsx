
import React from 'react';

interface ImportResultsModalProps {
  results: { added: number; skipped: number; errors: number; updated?: number };
  onClose: () => void;
}

export const ImportResultsModal: React.FC<ImportResultsModalProps> = ({ results, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl transform transition-all">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">📊</span> Import Complete
        </h3>
        
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-4 grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-emerald-400">{results.added}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Added</p>
            </div>
            <div className="border-l border-slate-700">
              <p className="text-xl font-bold text-blue-400">{results.updated || 0}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Updated</p>
            </div>
            <div className="border-l border-slate-700">
              <p className="text-xl font-bold text-amber-400">{results.skipped}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Skipped</p>
            </div>
            <div className="border-l border-slate-700">
              <p className="text-xl font-bold text-red-400">{results.errors}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Errors</p>
            </div>
          </div>

          <div className="text-sm text-slate-300 space-y-2 bg-slate-800 p-3 rounded border border-slate-700">
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span><strong>Added:</strong> New records created.</span>
            </p>
            <p className="flex items-start gap-2">
                <span className="text-blue-400">↻</span>
                <span><strong>Updated:</strong> Existing records updated via ID match.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-400">⚠</span>
              <span><strong>Skipped:</strong> Logical duplicates (Same Time/Teacher).</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-red-400">✕</span>
              <span><strong>Errors:</strong> Missing required data.</span>
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-primary-600/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
