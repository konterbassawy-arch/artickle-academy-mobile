/**
 * AIRewriteButton — inline AI polish button with undo support.
 *
 * After a successful rewrite an Undo button appears next to it.
 * Undo reverts to the exact text that existed before the last rewrite.
 * Undo disappears when the user triggers another rewrite.
 *
 * Usage:
 *   <AIRewriteButton value={notes} onRewrite={setNotes} />
 */

import React, { useState, useCallback } from 'react';
import { rewriteLessonNote } from '../services/aiSummary/rewriteText';

type Status = 'idle' | 'loading' | 'done' | 'error';

interface AIRewriteButtonProps {
  value: string;
  onRewrite: (improved: string) => void;
}

export const AIRewriteButton: React.FC<AIRewriteButtonProps> = ({ value, onRewrite }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [previousValue, setPreviousValue] = useState<string | null>(null);

  const handleRewrite = useCallback(async () => {
    if (!value.trim() || status === 'loading') return;
    setPreviousValue(value);          // snapshot before overwriting
    setStatus('loading');
    try {
      const improved = await rewriteLessonNote(value);
      onRewrite(improved);
      setStatus('done');
    } catch {
      setPreviousValue(null);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }, [value, status, onRewrite]);

  const handleUndo = useCallback(() => {
    if (previousValue !== null) {
      onRewrite(previousValue);
      setPreviousValue(null);
      setStatus('idle');
    }
  }, [previousValue, onRewrite]);

  const disabled = !value.trim() || status === 'loading';

  return (
    <div className="flex items-center gap-1">
      {/* Undo button — visible after a successful rewrite */}
      {status === 'done' && previousValue !== null && (
        <button
          type="button"
          onClick={handleUndo}
          title="Undo AI rewrite"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold
            bg-slate-700/60 border border-slate-600/50 text-slate-400
            hover:bg-slate-700 hover:text-white transition-all"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Undo
        </button>
      )}

      {/* Main rewrite button */}
      <button
        type="button"
        onClick={handleRewrite}
        disabled={disabled}
        title="Rewrite with AI"
        className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold
          transition-all border
          ${status === 'done'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            : status === 'error'
            ? 'bg-red-500/15 border-red-500/30 text-red-400'
            : 'bg-violet-500/10 border-violet-500/25 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300'
          }
          disabled:opacity-40 disabled:cursor-not-allowed
        `}
      >
        {status === 'loading' ? (
          <>
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Rewriting…
          </>
        ) : status === 'done' ? (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Rewritten
          </>
        ) : status === 'error' ? (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed — retry
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a1 1 0 01-.707.293H9.372a1 1 0 01-.707-.293l-.346-.346z" />
            </svg>
            AI Rewrite
          </>
        )}
      </button>
    </div>
  );
};
