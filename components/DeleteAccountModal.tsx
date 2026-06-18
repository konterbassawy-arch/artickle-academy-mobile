import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface DeleteAccountModalProps {
  onClose: () => void;
}

/**
 * In-app account deletion dialog (App Store 5.1.1(v) / Google Play requirement).
 * The user must type DELETE to confirm; password accounts also enter their password
 * so we can re-authenticate if the session is stale.
 */
export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ onClose }) => {
  const { deleteMyAccount, currentUser } = useApp();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE' && !busy;

  const handleDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const result = await deleteMyAccount(password || undefined);
    if (!result.success) {
      setError(result.message || 'Failed to delete account.');
      setBusy(false);
      return;
    }
    // On success the app state resets and the user is returned to the login screen.
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 ring-1 ring-red-500/30 shadow-2xl p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-red-400">⚠</span> Delete your account
        </h2>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          This permanently deletes your account
          {currentUser?.email ? <> (<span className="text-slate-100">{currentUser.email}</span>)</> : null} and your
          personal profile data. <span className="text-red-300 font-medium">This cannot be undone.</span>
        </p>

        <label className="block mt-5 text-xs font-medium text-slate-400 uppercase tracking-wide">
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-lg bg-slate-800 text-white px-3 py-2 ring-1 ring-slate-700 focus:ring-red-500 outline-none"
          placeholder="DELETE"
        />

        <label className="block mt-4 text-xs font-medium text-slate-400 uppercase tracking-wide">
          Password <span className="normal-case text-slate-500">(leave blank if you sign in with Google)</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg bg-slate-800 text-white px-3 py-2 ring-1 ring-slate-700 focus:ring-red-500 outline-none"
          placeholder="••••••••"
        />

        {error && (
          <p className="mt-4 text-sm text-red-300 bg-red-500/10 ring-1 ring-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2 px-3 rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete}
            className="flex-1 py-2 px-3 rounded-lg text-white bg-red-600 hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
};
