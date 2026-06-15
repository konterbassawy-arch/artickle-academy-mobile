/**
 * SchoolCertificateBranding
 *
 * Edits a school's certificate co-branding: logo + up to 2 signatories
 * (e.g. Head of Music, Head of School), each with a printed name and an
 * optional handwritten-signature PNG. Stored as base64 in Firestore at
 * schoolCertificates/{schoolId} (Storage bucket is locked deny-all).
 *
 * Self-contained: loads and saves its own Firestore document.
 */

import React, { useEffect, useState } from 'react';
import {
  loadSchoolCertificateConfig,
  saveSchoolCertificateConfig,
  SchoolSignatory,
  LogoBackdrop,
} from '../services/schoolCertificate';
import { generateCertificatePDF, CertInput } from '../services/certificateExport';

/** Read a File as a base64 data URL. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Turn near-white pixels of a PNG/image data URL transparent (chroma key).
 *  Used for signatures and (optionally) logos so a white background box disappears. */
function removeWhiteDataUrl(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(src); return; }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          // Near-white → fully transparent.
          if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** Read a File → base64, then chroma-key near-white to transparent. */
async function fileToTransparentPng(file: File): Promise<string> {
  const src = await fileToBase64(file);
  return removeWhiteDataUrl(src);
}

const EMPTY_SIG: SchoolSignatory = { title: '', name: '', signatureBase64: undefined };

export const SchoolCertificateBranding: React.FC<{ schoolId: string; schoolName?: string }> = ({ schoolId, schoolName }) => {
  const [logo, setLogo] = useState<string | undefined>();
  const [logoOriginal, setLogoOriginal] = useState<string | undefined>();
  const [removeLogoWhite, setRemoveLogoWhite] = useState(true);
  const [logoBackdrop, setLogoBackdrop] = useState<LogoBackdrop>('none');
  const [logoScale, setLogoScale] = useState(1);
  const [signatories, setSignatories] = useState<SchoolSignatory[]>([{ ...EMPTY_SIG }, { ...EMPTY_SIG }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSchoolCertificateConfig(schoolId).then(cfg => {
      if (!alive) return;
      setLogo(cfg?.logoBase64);
      setLogoOriginal(cfg?.logoBase64);
      setLogoBackdrop(cfg?.logoBackdrop ?? 'none');
      setLogoScale(cfg?.logoScale ?? 1);
      const sigs = cfg?.signatories ?? [];
      setSignatories([sigs[0] ?? { ...EMPTY_SIG }, sigs[1] ?? { ...EMPTY_SIG }]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [schoolId]);

  const updateSig = (i: number, patch: Partial<SchoolSignatory>) =>
    setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const handleLogoFile = async (file: File | null) => {
    if (!file) { setLogo(undefined); setLogoOriginal(undefined); return; }
    const orig = await fileToBase64(file);
    setLogoOriginal(orig);
    setLogo(removeLogoWhite ? await removeWhiteDataUrl(orig) : orig);
  };

  const handleToggleLogoWhite = async () => {
    const next = !removeLogoWhite;
    setRemoveLogoWhite(next);
    if (logoOriginal) setLogo(next ? await removeWhiteDataUrl(logoOriginal) : logoOriginal);
  };

  const handleSigFile = async (i: number, file: File | null) => {
    // Auto-remove the white background so the signature sits cleanly on the certificate.
    updateSig(i, { signatureBase64: file ? await fileToTransparentPng(file) : undefined });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveSchoolCertificateConfig(schoolId, {
        logoBase64: logo,
        logoBackdrop,
        logoScale,
        signatories: signatories.filter(s => s.name?.trim() || s.title?.trim() || s.signatureBase64),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  // Download a real co-branded certificate using the CURRENT (unsaved) settings,
  // so the actual rendered logo/backdrop/signatures can be checked.
  const [testing, setTesting] = useState(false);
  const handleDownloadTest = async () => {
    setTesting(true);
    try {
      const now = new Date();
      const sample: CertInput = {
        id: 'sample',
        studentId: 'SAMPLE',
        studentName: 'Sample Student',
        instrument: 'Piano',
        lessonType: 'Individual',
        totalLessons: 12,
        durationMinutes: 60,
        endDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        schoolName: schoolName ?? 'School',
        schoolId,
        teacherName: 'Instructor Name',
        coBranded: true,
      };
      await generateCertificatePDF(sample, 'download', undefined, undefined, {
        logoBase64: logo,
        logoBackdrop,
        logoScale,
        signatories: signatories.filter(s => s.name?.trim() || s.title?.trim() || s.signatureBase64),
      });
    } finally {
      setTesting(false);
    }
  };

  const fieldCls = 'bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-primary-500/40 w-full';

  if (loading) {
    return <p className="text-[11px] text-slate-500">Loading certificate branding…</p>;
  }

  return (
    <div className="space-y-4 bg-slate-900/40 ring-1 ring-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-amber-300/80 uppercase tracking-wider">Certificate branding</p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-emerald-400">Saved ✓</span>}
          <button onClick={handleDownloadTest} disabled={testing}
            className="bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
            {testing ? 'Generating…' : 'Download test certificate'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : 'Save branding'}
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg bg-slate-800 ring-1 ring-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {logo
            ? <img src={logo} alt="School logo" className="max-w-full max-h-full object-contain" />
            : <span className="text-[9px] text-slate-600 text-center px-1">No logo</span>}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">School logo (PNG, transparent background recommended)</p>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              {logo ? 'Replace' : 'Upload PNG'}
              <input type="file" accept="image/png,image/*" className="hidden"
                onChange={e => handleLogoFile(e.target.files?.[0] ?? null)} />
            </label>
            {logo && (
              <button onClick={() => { setLogo(undefined); setLogoOriginal(undefined); }} className="text-red-400/80 hover:text-red-400 text-xs transition-colors">Remove</button>
            )}
          </div>
          <button type="button" onClick={handleToggleLogoWhite} className="flex items-center gap-1.5 mt-1.5">
            <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${removeLogoWhite ? 'bg-amber-500 border-amber-500' : 'border-slate-600'}`}>
              {removeLogoWhite && <svg className="w-2 h-2 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="text-[10px] text-slate-400">Remove white background <span className="text-slate-600">(turn off only if the logo has white text)</span></span>
          </button>
        </div>
      </div>

      {/* Logo backdrop */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-slate-400">Logo backdrop</span>
        <div className="flex gap-1.5">
          {([
            { v: 'none' as const,  label: 'None' },
            { v: 'white' as const, label: 'White card' },
            { v: 'dark' as const,  label: 'Dark card' },
          ]).map(({ v, label }) => (
            <button key={v} onClick={() => setLogoBackdrop(v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                logoBackdrop === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}>{label}</button>
          ))}
        </div>
        <span className="text-[10px] text-slate-600">Use “Dark card” for logos with white text (e.g. King’s College); “None” for clean transparent logos.</span>
      </div>

      {/* Logo size — match the school logo visually to the Artickle mark */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-slate-400">School logo size</span>
        <input
          type="range" min={0.6} max={1.4} step={0.05} value={logoScale}
          onChange={e => setLogoScale(parseFloat(e.target.value))}
          className="w-40 accent-amber-500"
        />
        <span className="text-[11px] text-slate-300 tabular-nums w-10">{Math.round(logoScale * 100)}%</span>
        <button onClick={() => setLogoScale(1)} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">Reset</button>
        <span className="text-[10px] text-slate-600">Nudge until it visually matches the Artickle logo in the preview.</span>
      </div>

      {/* Signatories */}
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">Signatories (shown in the footer of co-branded certificates)</p>
        {signatories.map((sig, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input className={fieldCls} placeholder={i === 0 ? 'Title (e.g. Head of Music)' : 'Title (e.g. Head of School)'}
              value={sig.title} onChange={e => updateSig(i, { title: e.target.value })} />
            <input className={fieldCls} placeholder="Name (e.g. Dr. Sara Khan)"
              value={sig.name} onChange={e => updateSig(i, { name: e.target.value })} />
            <div className="flex items-center gap-2">
              <div className="w-14 h-9 rounded bg-slate-800 ring-1 ring-white/10 flex items-center justify-center overflow-hidden shrink-0">
                {sig.signatureBase64
                  ? <img src={sig.signatureBase64} alt="Signature" className="max-w-full max-h-full object-contain" />
                  : <span className="text-[8px] text-slate-600">sig</span>}
              </div>
              <label className="cursor-pointer bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap">
                {sig.signatureBase64 ? 'Replace' : 'Signature'}
                <input type="file" accept="image/png,image/*" className="hidden"
                  onChange={e => handleSigFile(i, e.target.files?.[0] ?? null)} />
              </label>
              {sig.signatureBase64 && (
                <button onClick={() => updateSig(i, { signatureBase64: undefined })} className="text-red-400/80 hover:text-red-400 text-[11px] transition-colors">×</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview — mirrors how the certificate header + footer will look */}
      <div className="space-y-2">
        <p className="text-[11px] text-slate-400">Preview <span className="text-slate-600">(how it appears on the certificate paper)</span></p>
        <div className="rounded-xl p-5 flex flex-col items-center gap-5" style={{ background: '#F4EBD7' }}>
          {/* Logo lockup — auto-centred as a single pair (bounding box centred),
              mirroring the PDF layout. */}
          <div
            className="inline-flex items-center justify-center rounded-lg"
            style={{
              gap: 10,
              padding: logoBackdrop === 'none' ? 0 : '8px 14px',
              background: logoBackdrop === 'white' ? '#ffffff' : logoBackdrop === 'dark' ? '#1a1a1a' : 'transparent',
              border: logoBackdrop === 'none' ? 'none' : '1px solid #B08926',
            }}
          >
            <img src="/logo-gold.png" alt="Artickle" style={{ height: 44, maxWidth: 84, objectFit: 'contain' }} />
            {logo
              ? <img src={logo} alt="School" style={{ height: 44 * logoScale, maxWidth: 84 * logoScale, objectFit: 'contain' }} />
              : <span className="text-[10px]" style={{ color: '#9a8a66' }}>school logo</span>}
          </div>

          {/* Signatory previews on the paper */}
          {signatories.some(s => s.signatureBase64 || s.name?.trim()) && (
            <div className="flex items-end justify-center gap-8 flex-wrap">
              {signatories.filter(s => s.signatureBase64 || s.name?.trim()).map((s, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="h-9 flex items-end justify-center">
                    {s.signatureBase64 && <img src={s.signatureBase64} alt="sig" style={{ maxHeight: 34, maxWidth: 120, objectFit: 'contain' }} />}
                  </div>
                  <div style={{ width: 120, borderTop: '1px solid #B08926', marginTop: 2 }} />
                  <span className="text-[11px] font-semibold mt-1" style={{ color: '#1a1a1a' }}>{s.name || '—'}</span>
                  <span className="text-[8px] uppercase tracking-wider" style={{ color: '#5a5a5a' }}>{s.title || 'Signatory'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-600">Tip: if the school logo has white text, choose “Dark card”. Signatures have their white background removed automatically.</p>
      </div>
    </div>
  );
};

export default SchoolCertificateBranding;
