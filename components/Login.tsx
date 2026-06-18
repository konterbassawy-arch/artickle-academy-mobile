
import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../context/AppContext';

// Apple requires "Sign in with Apple" on iOS whenever another social login (Google) is
// offered. It uses the native Apple sheet, so we only surface the button on iOS.
const showAppleSignIn = Capacitor.getPlatform() === 'ios';

export const Login: React.FC = () => {
  const { login, loginWithGoogle, loginWithApple, authError } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await login(email, password);
    if (!res.success) {
      setError(res.message || 'Login failed. Please check your credentials.');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const res = await loginWithGoogle();
    if (!res.success) {
      setError(res.message || 'Google Login failed.');
    }
    setLoading(false);
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    setError('');
    const res = await loginWithApple();
    if (!res.success) {
      setError(res.message || 'Sign in with Apple failed.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      {/* Subtle background grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-950/30 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative max-w-md w-full">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="" className="w-20 h-20 object-contain opacity-90 drop-shadow-md mb-5 mx-auto" style={{maxWidth: '80px', maxHeight: '80px'}} />
          <h1 className="text-3xl font-bold text-white tracking-tight">
            ARTickle <span className="text-primary-400">Academy</span>
          </h1>
          <p className="text-slate-500 text-sm mt-2">Sign in to your dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur rounded-2xl ring-1 ring-white/8 shadow-2xl shadow-black/40 p-8">

          {/* Error banner */}
          {(error || authError) && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-sm text-center font-medium">
              {authError || error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                placeholder="name@school.com"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                placeholder="••••••••"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-primary-900/30 active:scale-[0.98] text-sm tracking-wide mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-900/80 px-3 text-[11px] text-slate-500 uppercase tracking-widest">
                or continue with
              </span>
            </div>
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-sm active:scale-[0.98]"
          >
            {/* Full-color Google G */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Sign in with Apple — iOS only (Apple guideline 4.8) */}
          {showAppleSignIn && (
            <button
              onClick={handleAppleLogin}
              disabled={loading}
              className="w-full mt-3 bg-white hover:bg-slate-100 text-black font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm active:scale-[0.98]"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.63 0 2.91.06 4.41 2.19-.13.09-2.43 1.42-2.43 4.24 0 3.26 2.835 4.41 2.926 4.44z"/>
              </svg>
              Sign in with Apple
            </button>
          )}

          {/* Footer */}
          <p className="mt-8 text-[10px] text-slate-600 text-center uppercase tracking-widest">
            ARTickle Academy Manager © 2025
          </p>
        </div>
      </div>
    </div>
  );
};
