/**
 * CertificateModal.tsx
 *
 * Editable Certificate of Completion.
 * - All fields are editable (student name, instrument, start/end date, teacher name).
 * - Completion statement auto-rebuilds from the fields unless manually customised.
 * - No live PDF preview — Download generates on demand.
 * - onSave returns the full updated CertInput so callers can persist every edit.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CertInput,
  buildCompletionLine,
  generateCertificatePDF,
} from '../services/certificateExport';

/** Convert ISO date (YYYY-MM-DD or YYYY-MM) → input[type=month] value YYYY-MM */
const toMonth = (iso?: string): string => (iso ? iso.slice(0, 7) : '');
/** Convert input[type=month] value YYYY-MM → ISO date YYYY-MM-01 */
const fromMonth = (m: string): string | undefined => (m ? m + '-01' : undefined);

interface Props {
  data: CertInput;
  /** Saved completion sentence (pre-fill for edit mode). */
  initialText?: string;
  readOnly?: boolean;
  saving?: boolean;
  /** When true, show the co-branding toggle (the student's school has a logo configured). */
  schoolHasLogo?: boolean;
  /** Receives the full updated CertInput on save (body override is set when manually customised). */
  onSave?: (updatedInput: CertInput) => void;
  onClose: () => void;
}

export const CertificateModal: React.FC<Props> = ({
  data, initialText, readOnly = false, saving = false, schoolHasLogo = false, onSave, onClose,
}) => {
  // Editable field state — initialised from data
  const [studentName, setStudentName]   = useState(data.studentName);
  const [instrument,  setInstrument]    = useState(data.instrument);
  const [startDate,   setStartDate]     = useState(toMonth(data.startDate));
  const [endDate,     setEndDate]       = useState(toMonth(data.endDate));
  const [teacherName, setTeacherName]   = useState(data.teacherName);
  const [coBranded,   setCoBranded]     = useState(!!data.coBranded);

  // Completion text — auto-built from fields, unless the user manually edits it.
  const [textCustomised, setTextCustomised] = useState(!!initialText);
  const [bodyText, setBodyText] = useState('');

  const derivedInput = useMemo((): CertInput => ({
    ...data,
    studentName,
    instrument,
    // Fields are authoritative: a cleared month means "omit it" (no silent fallback).
    startDate: fromMonth(startDate),
    endDate:   fromMonth(endDate),
    teacherName,
    coBranded,
    bodyOverride: undefined,
  }), [data, studentName, instrument, startDate, endDate, teacherName, coBranded]);

  const autoText = useMemo(() => buildCompletionLine(derivedInput), [derivedInput]);

  // Initialise bodyText once on mount
  useEffect(() => {
    setBodyText(initialText ?? autoText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep body text in sync with fields while user hasn't manually edited it
  useEffect(() => {
    if (!textCustomised) setBodyText(autoText);
  }, [autoText, textCustomised]);

  const buildUpdatedInput = (): CertInput => ({
    ...derivedInput,
    bodyOverride: textCustomised ? bodyText : undefined,
  });

  const handleBodyChange = (val: string) => {
    setBodyText(val);
    setTextCustomised(true);
  };

  const handleReset = () => {
    setTextCustomised(false);
    setBodyText(autoText);
  };

  const handleDownload = () => generateCertificatePDF(buildUpdatedInput(), 'download');
  const handleSave = () => onSave?.(buildUpdatedInput());

  // ── Shared input styling ──────────────────────────────────────────────────
  const inputClass = (disabled?: boolean) =>
    `w-full rounded-xl px-3 py-2 text-sm text-slate-200 bg-slate-800/60 border border-slate-600 focus:outline-none focus:border-primary-500 transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-lg flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold tracking-wide shrink-0">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="5" /><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5" />
              </svg>
              Certificate
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none">Certificate of Completion</p>
              <p className="text-xs text-slate-500 mt-0.5">Edit fields — changes apply on Download / Save</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — all fields */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto max-h-[70vh]">

          {/* Student name */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Student name</label>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} disabled={readOnly} className={inputClass(readOnly)} />
          </div>

          {/* Instrument + Teacher row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Instrument / course</label>
              <input value={instrument} onChange={e => setInstrument(e.target.value)} disabled={readOnly} className={inputClass(readOnly)} />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Teacher (Instructor)</label>
              <input value={teacherName} onChange={e => setTeacherName(e.target.value)} disabled={readOnly} className={inputClass(readOnly)} />
            </div>
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                <span>Start month <span className="text-slate-600 normal-case">(optional)</span></span>
                {!readOnly && startDate && (
                  <button type="button" onClick={() => setStartDate('')} className="text-[10px] text-slate-500 hover:text-primary-300 normal-case font-medium transition-colors">Clear</button>
                )}
              </label>
              <input type="month" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={readOnly} className={inputClass(readOnly)} />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">End month</label>
              <input type="month" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={readOnly} className={inputClass(readOnly)} />
            </div>
          </div>
          {!startDate && (
            <p className="text-[10px] text-slate-500 -mt-1">No start month → the certificate reads “…course, completed {endDate ? new Date(endDate + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Month Year'}.”</p>
          )}

          {/* Completion statement */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Completion statement</label>
            <textarea
              value={bodyText}
              onChange={e => handleBodyChange(e.target.value)}
              readOnly={readOnly}
              rows={3}
              className={`${inputClass(readOnly)} resize-none`}
            />
            {!readOnly && textCustomised && (
              <button onClick={handleReset} className="mt-1 text-[11px] text-slate-400 hover:text-primary-300 transition-colors">
                ↺ Reset to default
              </button>
            )}
          </div>

          {/* Co-branding toggle — only when the school has a logo configured */}
          {schoolHasLogo && (
            <button
              type="button"
              onClick={() => !readOnly && setCoBranded(v => !v)}
              disabled={readOnly}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${coBranded ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'} ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${coBranded ? 'bg-amber-500 border-amber-500' : 'border-slate-600'}`}>
                {coBranded && <svg className="w-2.5 h-2.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="min-w-0">
                <span className={`text-sm font-medium block ${coBranded ? 'text-white' : 'text-slate-400'}`}>Co-brand with school</span>
                <span className="text-[10px] text-slate-500">Adds the school logo + signatories alongside the Artickle branding.</span>
              </span>
            </button>
          )}

          {/* Info strip */}
          <div className="text-[11px] text-slate-600 border-t border-slate-800 pt-3">
            Right side: Artickle Academy stamp · Left side: teacher's saved signature (auto-loaded)
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors">
            Close
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
          {!readOnly && onSave && (
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait">
              {saving
                ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving…</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Save</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CertificateModal;
