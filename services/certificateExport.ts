/**
 * certificateExport.ts
 *
 * Certificate of Completion — branded jsPDF, A4 landscape.
 * Design: classic framed diploma in a shiny-gold palette, using the Artickle
 * σ + "artickle" mark (gold) crest, the teacher's saved signature (left) and the
 * academy stamp (right).
 *
 * Public API:
 *   - resolveCertInput(student, …)        → builds render data from enrollment / period / lessons
 *   - buildCompletionLine(input)          → the editable body sentence
 *   - generateCertificatePDF(input, mode) → single certificate (download or data-uri)
 *   - generateCertificatesZIP(inputs, …)  → one ZIP, one PDF per student (bulk export)
 *   - snapshotFromCertInput / certInputFromSnapshot → persist & rebuild for saved certificates
 *
 * Eligibility is NOT enforced here — a certificate can be produced for any
 * student. Callers decide what to offer.
 *
 * Uses jsPDF + JSZip loaded via CDN (window.jspdf / window.JSZip), matching pdfExport.ts.
 */

import { Enrollment, Student, SchoolEnrollmentPeriod, Lesson, LessonStatus, getTodayISO, ENROLLMENT_CONSUMED_STATUSES } from '../types';
import { CertificateSnapshot } from './aiSummary/reportTypes';
import { loadSchoolCertificateConfig, SchoolCertificateConfig, SchoolSignatory } from './schoolCertificate';
import { getRelevantPeriodsForStudent } from './schoolPeriodProgress';
// @ts-ignore — CDN imports (match bulkReportService.ts) for reading the teacher signature from Firestore
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc } from 'firebase/firestore';
// @ts-ignore
import { getApp } from 'firebase/app';

/**
 * Minimal shape needed to render a certificate. An Enrollment satisfies it,
 * and a saved CertificateSnapshot can be mapped to it. `bodyOverride`, when
 * present, replaces the auto-generated completion sentence (editable text).
 */
export interface CertInput {
  id: string;            // enrollment id, school-period id, or student id — used for the cert-id hash
  studentId?: string;    // student doc id — shown in the certificate id
  studentName: string;
  instrument: string;
  lessonType: string;
  totalLessons: number;
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  schoolName?: string;
  schoolId?: string;     // used to load the school's co-branding assets (logo + signatories)
  teacherName: string;
  teacherId?: string;    // used to load the teacher's saved signature
  bodyOverride?: string; // custom completion sentence; overrides the auto-built one
  coBranded?: boolean;   // true = render the school logo + signatories alongside Artickle
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset loaders. NOTE: logo + stamp are cached for the page session — if either
// file is replaced, a page reload is needed to pick up the new image. Teacher
// signatures are read fresh from Firestore each time (not session-cached).
// ─────────────────────────────────────────────────────────────────────────────

// Load the fixed academy stamp from /stamp.png (optional). Cached for the session.
// Right-hand stamp on every certificate. Returns undefined if the file is absent.
let _adminSigCache: string | null | undefined;
const loadAdminSignature = async (): Promise<string | undefined> => {
  if (_adminSigCache !== undefined) return _adminSigCache ?? undefined;
  try {
    const resp = await fetch('/stamp.png');
    if (!resp.ok) { _adminSigCache = null; return undefined; }
    const blob = await resp.blob();
    _adminSigCache = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return _adminSigCache ?? undefined;
  } catch { _adminSigCache = null; return undefined; }
};

/** Load a school's certificate branding (logo + signatories) base64 from Firestore.
 *  NOT cached — branding can be edited and saved at any time, so each render must
 *  reflect the latest saved logo/signatories. Returns null when no config exists. */
const loadSchoolCert = async (schoolId?: string): Promise<SchoolCertificateConfig | null> => {
  if (!schoolId) return null;
  return loadSchoolCertificateConfig(schoolId);
};

/** Load a teacher's saved signature base64 from Firestore (same source as the end-of-term report). */
const loadSignatureDataUrl = async (teacherId?: string): Promise<string | undefined> => {
  if (!teacherId) return undefined;
  try {
    const db = getFirestore(getApp());
    const snap = await firestoreGetDoc(firestoreDoc(db, 'teacherSignatures', teacherId));
    return snap.exists() ? snap.data()?.base64 : undefined;
  } catch {
    return undefined;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Gold palette (no lime / no dark blue)
// ─────────────────────────────────────────────────────────────────────────────
const GOLD        = [176, 137, 38]  as const; // mid gold — rules / inner frame
const GOLD_BRIGHT = [201, 162, 39]  as const; // bright gold — accents / outer frame / underline
const INK         = [26, 26, 26]    as const; // near-black — all body text
const MUTED       = [90, 90, 90]    as const; // grey — captions / id / date
const PAPER       = [244, 235, 215] as const; // warm beige / parchment

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const fmtShort = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtMonthYear = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';

/** Certificate ID: ARTK-{STUDENT_ID}-{HASH6} e.g. ARTK-ST_AS_006-2B3C4D */
const certificateId = (e: CertInput): string => {
  const sid = e.studentId ? e.studentId.toUpperCase() : 'STU';
  const hash = e.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'XXXXXX';
  return `ARTK-${sid}-${hash}`;
};

// ── TRIAL: render the Artickle crest in black instead of gold ────────────────
// Flip this to 'gold' to revert instantly (one-line undo). When 'black', the
// gold logo is recoloured to near-black at load time, keeping its exact size,
// shape and transparency.
const ARTICKLE_LOGO_COLOR: 'gold' | 'black' = 'black';

/** Recolour every opaque pixel of an image data URL to near-black, preserving
 *  alpha (so the shape/size and anti-aliased edges are unchanged). */
const recolorToBlack = (src: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(src); return; }
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] > 0) { px[i] = 26; px[i + 1] = 26; px[i + 2] = 26; }
        }
        ctx.putImageData(d, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

// Load /logo-gold.png as base64 (recoloured black when the trial flag is on). Cached.
let _logoCache: string | null | undefined;
const loadLogoBase64 = async (): Promise<string | null> => {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const resp = await fetch('/logo-gold.png');
    if (!resp.ok) { _logoCache = null; return null; }
    const blob = await resp.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    _logoCache = dataUrl && ARTICKLE_LOGO_COLOR === 'black'
      ? await recolorToBlack(dataUrl)
      : dataUrl;
    return _logoCache;
  } catch { _logoCache = null; return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Prose helper — "for completion of the Piano course between September 2025
//                 and June 2026." (no lesson hours)
// ─────────────────────────────────────────────────────────────────────────────
export const buildCompletionLine = (e: CertInput): string => {
  if (e.bodyOverride && e.bodyOverride.trim()) return e.bodyOverride.trim();
  let s = `for completion of the ${e.instrument} course`;
  const from = fmtMonthYear(e.startDate);
  const to   = fmtMonthYear(e.endDate);
  if (from && to) s += ` between ${from} and ${to}`;
  else if (to)    s += `, completed ${to}`;
  return s + '.';
};

// Truly-centered letter-spaced text. jsPDF's {align:'center'} does NOT account
// for charSpace, so spaced captions drift right — we center manually.
const centeredSpaced = (
  doc: any, txt: string, centerX: number, y: number,
  font: string, style: string, size: number,
  color: readonly [number, number, number], charSpace: number,
): void => {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const w = doc.getTextWidth(txt) + charSpace * Math.max(0, txt.length - 1);
  doc.text(txt, centerX - w / 2, y, { charSpace });
};

// Draw a signature block: a rendered signature image (if provided) sitting on
// the line, then the printed name + role beneath it. No script-text fallback —
// the space above the line is left blank when there is no signature image.
const drawSignature = (
  doc: any, centerX: number, lineY: number, sigName: string, role: string,
  sigImg?: string,
  opts?: {
    /** Render the image as a square stamp (e.g. academy seal) rather than a wide handwritten signature. */
    stamp?: boolean;
    /** Half-width of the signature line (default 32). Shrink when packing many columns. */
    halfW?: number;
    /** Square stamp size in mm (default 66). */
    stampSize?: number;
  },
): void => {
  const halfW = opts?.halfW ?? 32;
  if (sigImg) {
    try {
      if (opts?.stamp) {
        const s = opts?.stampSize ?? 66; // square stamp, sitting lower so it overlaps the line
        doc.addImage(sigImg, 'PNG', centerX - s / 2, lineY - s + 9, s, s);
      } else {
        const w = Math.min(46, halfW * 1.5);
        const h = w * (15 / 46);
        doc.addImage(sigImg, 'PNG', centerX - w / 2, lineY - h - 2, w, h);
      }
    } catch { /* skip */ }
  }
  // rule
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(centerX - halfW, lineY, centerX + halfW, lineY);
  // printed name (shrink if the column is narrow)
  doc.setFont('times', 'bold');
  doc.setFontSize(halfW < 28 ? 9.5 : 11);
  doc.setTextColor(...INK);
  doc.text(sigName || '—', centerX, lineY + 6, { align: 'center', maxWidth: halfW * 2 });
  // role caption
  centeredSpaced(doc, role.toUpperCase(), centerX, lineY + 11, 'helvetica', 'normal', 7, MUTED, 0.5);
};

// Compute the dimensions of an image scaled to FIT inside boxW×boxH preserving
// aspect ratio. Falls back to the box size if natural dimensions can't be read.
const fitDims = (doc: any, dataUrl: string, boxW: number, boxH: number): { w: number; h: number } => {
  try {
    const p = doc.getImageProperties(dataUrl);
    if (p?.width && p?.height) {
      const r = Math.min(boxW / p.width, boxH / p.height);
      return { w: p.width * r, h: p.height * r };
    }
  } catch { /* fall through */ }
  return { w: boxW, h: boxH };
};

// Draw an image centered at (cx, cy), scaled to FIT inside boxW×boxH (no distortion).
const drawImageFitted = (
  doc: any, dataUrl: string, cx: number, cy: number, boxW: number, boxH: number,
): void => {
  try {
    const { w, h } = fitDims(doc, dataUrl, boxW, boxH);
    doc.addImage(dataUrl, 'PNG', cx - w / 2, cy - h / 2, w, h);
  } catch { /* skip */ }
};

// ─────────────────────────────────────────────────────────────────────────────
// Draw one certificate onto the CURRENT page of `doc` (A4 landscape, mm).
// ─────────────────────────────────────────────────────────────────────────────
const drawCertificate = (
  doc: any, e: CertInput, logoBase64: string | null,
  teacherSignatureDataUrl?: string, adminSignatureDataUrl?: string,
  schoolCert?: SchoolCertificateConfig | null,
): void => {
  const coBranded = !!e.coBranded && !!schoolCert?.logoBase64;
  const W = 297;
  const H = 210;
  const cx = W / 2;

  // Paper fill
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, W, H, 'F');

  // Outer border (bright gold)
  doc.setDrawColor(...GOLD_BRIGHT);
  doc.setLineWidth(1.2);
  doc.rect(8, 8, W - 16, H - 16);

  // Inner hairline (mid gold)
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.rect(12, 12, W - 24, H - 24);

  // Gold L-corner accents on the inner frame
  const corner = 10;
  doc.setDrawColor(...GOLD_BRIGHT);
  doc.setLineWidth(1.4);
  doc.line(12, 12, 12 + corner, 12);             doc.line(12, 12, 12, 12 + corner);
  doc.line(W - 12, 12, W - 12 - corner, 12);     doc.line(W - 12, 12, W - 12, 12 + corner);
  doc.line(12, H - 12, 12 + corner, H - 12);     doc.line(12, H - 12, 12, H - 12 - corner);
  doc.line(W - 12, H - 12, W - 12 - corner, H - 12); doc.line(W - 12, H - 12, W - 12, H - 12 - corner);

  // Issue date — top-right corner
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Issued: ${fmtShort(new Date())}`, W - 18, 20, { align: 'right' });

  // Crest(s). Co-branded → Artickle + school as a single lockup, auto-centred on
  // the page centre (the whole pair's bounding box is centred), placed by each
  // logo's actual fitted width so the gap is consistent and nothing is distorted.
  if (coBranded) {
    const boxW = 28, boxH = 26, gap = 8;
    const midY = 31;
    const scale = Math.max(0.5, Math.min(1.6, schoolCert?.logoScale ?? 1));
    const aDim = logoBase64 ? fitDims(doc, logoBase64, boxW, boxH) : { w: 0, h: 0 };
    const sDim = schoolCert?.logoBase64 ? fitDims(doc, schoolCert.logoBase64, boxW * scale, boxH * scale) : { w: 0, h: 0 };
    const innerGap = aDim.w && sDim.w ? gap : 0;
    const totalW = aDim.w + innerGap + sDim.w;

    // Optional backdrop card behind the pair (so white-text logos can sit on dark, etc.).
    const backdrop = schoolCert?.logoBackdrop ?? 'none';
    if (backdrop === 'white' || backdrop === 'dark') {
      const plateW = totalW + 14;
      const plateH = Math.max(aDim.h, sDim.h, boxH) + 8;
      if (backdrop === 'white') doc.setFillColor(255, 255, 255);
      else doc.setFillColor(26, 26, 26);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.roundedRect(cx - plateW / 2, midY - plateH / 2, plateW, plateH, 3, 3, 'FD');
    }

    // Lay both out starting from the centred left edge of the pair.
    let x = cx - totalW / 2;
    if (aDim.w) { doc.addImage(logoBase64!, 'PNG', x, midY - aDim.h / 2, aDim.w, aDim.h); x += aDim.w + innerGap; }
    if (sDim.w) { doc.addImage(schoolCert!.logoBase64!, 'PNG', x, midY - sDim.h / 2, sDim.w, sDim.h); }
  } else if (logoBase64) {
    drawImageFitted(doc, logoBase64, cx, 33, 30, 30);
  }

  // "ACADEMY" caption under the standalone Artickle mark. Hidden on co-branded
  // certificates (it belongs to the Artickle wordmark, not the school logo).
  let y = 53;
  if (!coBranded) {
    centeredSpaced(doc, 'ACADEMY', cx, y, 'helvetica', 'bold', 10, INK, 3);
  }

  // Title
  y += 14;
  doc.setFont('times', 'bold');
  doc.setFontSize(33);
  doc.setTextColor(...INK);
  doc.text('Certificate of Completion', cx, y, { align: 'center' });

  // Rule with gold diamond
  y += 7;
  const ruleHalf = 38;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(cx - ruleHalf, y, cx - 5, y);
  doc.line(cx + 5, y, cx + ruleHalf, y);
  doc.setFillColor(...GOLD_BRIGHT);
  doc.triangle(cx, y - 2, cx - 2, y, cx + 2, y, 'F');
  doc.triangle(cx, y + 2, cx - 2, y, cx + 2, y, 'F');

  // "This is proudly presented to"
  y += 12;
  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('This is proudly presented to', cx, y, { align: 'center' });

  // Student name + gold underline
  y += 13;
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(e.studentName, cx, y, { align: 'center' });
  const nameW = Math.min(Math.max(doc.getTextWidth(e.studentName) + 24, 90), 200);
  doc.setDrawColor(...GOLD_BRIGHT);
  doc.setLineWidth(0.7);
  doc.line(cx - nameW / 2, y + 4, cx + nameW / 2, y + 4);

  // Completion line under the name
  y += 16;
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(buildCompletionLine(e), 200);
  doc.text(lines, cx, y, { align: 'center', lineHeightFactor: 1.5 });

  // ── Footer signatories: Instructor + (school signatories) + Artickle stamp ──
  const sigY = 178;
  type Block = { name: string; role: string; img?: string; stamp?: boolean };
  const blocks: Block[] = [
    { name: e.teacherName, role: 'Instructor', img: teacherSignatureDataUrl },
  ];
  if (coBranded && schoolCert?.signatories) {
    for (const s of schoolCert.signatories) {
      if (s.name?.trim() || s.title?.trim() || s.signatureBase64) {
        blocks.push({ name: s.name || '—', role: s.title || 'Signatory', img: s.signatureBase64 });
      }
    }
  }
  blocks.push({ name: 'Artickle Academy', role: 'Academy', img: adminSignatureDataUrl, stamp: true });

  // Distribute evenly across the usable width.
  const marginX = 26;
  const usable = W - marginX * 2;
  const n = blocks.length;
  const colW = usable / n;
  const halfW = Math.max(20, Math.min(32, colW / 2 - 4));
  const stampSize = Math.max(34, Math.min(66, colW - 8));
  blocks.forEach((b, i) => {
    const centerX = marginX + colW * (i + 0.5);
    drawSignature(doc, centerX, sigY, b.name, b.role, b.img, { stamp: b.stamp, halfW, stampSize });
  });

  // Certificate id (with school, when present) — bottom centre
  const idLine = e.schoolName
    ? `Certificate ID: ${certificateId(e)}  ·  ${e.schoolName}`
    : `Certificate ID: ${certificateId(e)}`;
  centeredSpaced(doc, idLine, cx, H - 15, 'helvetica', 'normal', 8, MUTED, 0.3);
};

/**
 * Resolve certificate render data for ANY student — enrollment record →
 * school enrollment period → plain lesson history. Returns null only when the
 * student has no enrollment, no period, and no completed lessons.
 * Shared by the student page (AISummaryCard) and bulk export.
 */
export const resolveCertInput = (
  student: Student,
  allEnrollments: Enrollment[],
  schoolEnrollmentPeriods: SchoolEnrollmentPeriod[],
  studentLessons: Lesson[],
  schoolName: string,
  teacherName: string,
  selectedPeriodName?: string,
): CertInput | null => {
  const studentEnrollments = allEnrollments
    .filter(e => e.studentId === student.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (studentEnrollments.length > 0) {
    let e = studentEnrollments[0];
    if (selectedPeriodName) {
      const period = schoolEnrollmentPeriods.find(p => p.name === selectedPeriodName);
      const match = period && studentEnrollments.find(en => en.schoolPeriodId === period.id);
      if (match) e = match;
    }
    // Default range = first → last paid lesson of this enrollment; fall back to enrollment dates.
    const range = consumedLessonRange(studentLessons, [e.id]);
    return {
      id: e.id,
      studentId: student.id,
      studentName: e.studentName || student.name,
      instrument: e.instrument || student.instrument,
      lessonType: e.lessonType || 'Individual',
      totalLessons: e.totalLessons,
      durationMinutes: e.durationMinutes,
      startDate: range.startDate ?? e.startDate,
      endDate: range.endDate ?? e.endDate,
      schoolName,
      schoolId: student.schoolId,
      teacherName: e.teacherName || teacherName,
      teacherId: e.teacherId || student.teacherId,
    };
  }

  const periods = getRelevantPeriodsForStudent(
    student, schoolEnrollmentPeriods, studentLessons, getTodayISO(), allEnrollments,
  );
  if (periods.length > 0) {
    const chosen =
      (selectedPeriodName && periods.find(p => p.period.name === selectedPeriodName)) ||
      periods.find(p => p.isCurrent) || periods[0];
    const eff = chosen.totalLessons > 0
      ? Math.round(chosen.totalMinutes / chosen.totalLessons)
      : (chosen.period.defaultDurationMinutes || 60);
    return {
      id: chosen.period.id,
      studentId: student.id,
      studentName: student.name,
      instrument: student.instrument,
      lessonType: 'Individual',
      totalLessons: chosen.totalLessons,
      durationMinutes: eff,
      startDate: chosen.period.startDate,
      endDate: chosen.period.endDate,
      schoolName,
      schoolId: student.schoolId,
      teacherName,
      teacherId: student.teacherId,
    };
  }

  const taught = studentLessons.filter(l => l.status === LessonStatus.PRESENT || l.status === LessonStatus.TAUGHT);
  if (taught.length > 0) {
    const totalMin = taught.reduce((s, l) => s + (l.durationMinutes || 60), 0);
    const dates = taught.map(l => l.date).sort();
    return {
      id: student.id,
      studentId: student.id,
      studentName: student.name,
      instrument: student.instrument,
      lessonType: 'Individual',
      totalLessons: taught.length,
      durationMinutes: Math.round(totalMin / taught.length),
      startDate: dates[0]?.slice(0, 10),
      endDate: dates[dates.length - 1]?.slice(0, 10),
      schoolName,
      schoolId: student.schoolId,
      teacherName,
      teacherId: student.teacherId,
    };
  }
  return null;
};

/**
 * Default certificate date range = first → last "paid" lesson, where a paid
 * lesson is one with a consuming status (Taught / Present / Absent-Unexcused).
 * Optionally restrict to specific enrollment ids (so the range follows the
 * selected enrollment(s)). Returns {} when no consumed lessons match.
 * The certificate formatter reduces these dates to "Month Year".
 */
export const consumedLessonRange = (
  lessons: Lesson[],
  enrollmentIds?: string[],
): { startDate?: string; endDate?: string } => {
  const idSet = enrollmentIds && enrollmentIds.length ? new Set(enrollmentIds) : null;
  const consumed = lessons.filter(l =>
    (ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status) &&
    (!idSet || (l.enrollmentId != null && idSet.has(l.enrollmentId)))
  );
  if (!consumed.length) return {};
  const dates = consumed.map(l => l.date.slice(0, 10)).sort();
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
};

/**
 * Count "paid" lessons (consuming status: Taught / Present / Absent-Unexcused),
 * optionally restricted to specific enrollment ids. Used by the bulk
 * minimum-lessons guard so we don't issue certificates with too few lessons.
 */
export const countPaidLessons = (
  lessons: Lesson[],
  enrollmentIds?: string[],
): number => {
  const idSet = enrollmentIds && enrollmentIds.length ? new Set(enrollmentIds) : null;
  return lessons.filter(l =>
    (ENROLLMENT_CONSUMED_STATUSES as readonly string[]).includes(l.status) &&
    (!idSet || (l.enrollmentId != null && idSet.has(l.enrollmentId)))
  ).length;
};

/**
 * Build a CertInput directly from a single known Enrollment (no period/lesson
 * resolution needed — the enrollment already has startDate/endDate).
 * Used by the enrollment picker and bulk merge logic.
 */
export const certInputFromEnrollment = (
  enrollment: Enrollment,
  student: Student,
  schoolName: string,
  teacherName?: string,
): CertInput => ({
  id: enrollment.id,
  studentId: student.id,
  studentName: enrollment.studentName || student.name,
  instrument: enrollment.instrument || student.instrument,
  lessonType: enrollment.lessonType || 'Individual',
  totalLessons: enrollment.totalLessons,
  durationMinutes: enrollment.durationMinutes,
  startDate: enrollment.startDate,
  endDate: enrollment.endDate,
  schoolName,
  schoolId: enrollment.schoolId ?? student.schoolId,
  teacherName: enrollment.teacherName || teacherName || '',
  teacherId: enrollment.teacherId || student.teacherId,
});

/**
 * Merge multiple CertInputs into one — spanning from the earliest start to the
 * latest end, with instruments listed as "Piano & Guitar". The primary (first)
 * input's other fields (teacher, school, IDs) are kept.
 */
export const mergeCertInputs = (inputs: CertInput[]): CertInput => {
  if (inputs.length === 1) return inputs[0];
  const primary = inputs[0];
  const starts  = inputs.map(i => i.startDate).filter(Boolean) as string[];
  const ends    = inputs.map(i => i.endDate).filter(Boolean)   as string[];
  const minStart = starts.length ? [...starts].sort()[0]          : primary.startDate;
  const maxEnd   = ends.length   ? [...ends].sort().reverse()[0]  : primary.endDate;
  const instruments = [...new Set(inputs.map(i => i.instrument).filter(Boolean))];
  return {
    ...primary,
    instrument: instruments.join(' & ') || primary.instrument,
    startDate: minStart,
    endDate:   maxEnd,
  };
};

/** Build the persisted snapshot from the render input (used when saving).
 *  Omits undefined optional fields — Firestore rejects `undefined` values. */
export const snapshotFromCertInput = (c: CertInput): CertificateSnapshot => {
  const snap: CertificateSnapshot = {
    enrollmentId: c.id,
    studentName: c.studentName,
    instrument: c.instrument,
    lessonType: c.lessonType,
    totalLessons: c.totalLessons,
    durationMinutes: c.durationMinutes,
    teacherName: c.teacherName,
  };
  if (c.startDate !== undefined) snap.startDate = c.startDate;
  if (c.endDate !== undefined) snap.endDate = c.endDate;
  if (c.schoolName !== undefined) snap.schoolName = c.schoolName;
  if (c.schoolId !== undefined) snap.schoolId = c.schoolId;
  if (c.teacherId !== undefined) snap.teacherId = c.teacherId;
  if (c.studentId !== undefined) snap.studentId = c.studentId;
  if (c.coBranded !== undefined) snap.coBranded = c.coBranded;
  return snap;
};

/** Rebuild render input from a persisted snapshot + the edited body text. */
export const certInputFromSnapshot = (s: CertificateSnapshot, bodyOverride?: string): CertInput => ({
  id: s.enrollmentId,
  studentId: s.studentId,
  studentName: s.studentName,
  instrument: s.instrument,
  lessonType: s.lessonType,
  totalLessons: s.totalLessons,
  durationMinutes: s.durationMinutes,
  startDate: s.startDate,
  endDate: s.endDate,
  schoolName: s.schoolName,
  schoolId: s.schoolId,
  teacherName: s.teacherName,
  teacherId: s.teacherId,
  coBranded: s.coBranded,
  bodyOverride,
});

// ─────────────────────────────────────────────────────────────────────────────
// Public: single certificate → downloads one PDF (or returns a data-uri string).
// Signatures are auto-loaded if not passed in.
// ─────────────────────────────────────────────────────────────────────────────
export const generateCertificatePDF = async (
  enrollment: CertInput,
  outputMode: 'download' | 'dataurl' = 'download',
  teacherSignatureDataUrl?: string,
  adminSignatureDataUrl?: string,
  /** Override the school branding instead of loading it from Firestore — used by
   *  the Configuration "Download test certificate" tool to preview unsaved edits. */
  schoolCertOverride?: SchoolCertificateConfig | null,
): Promise<string | void> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF Library loading… please wait or refresh.');
    return;
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = await loadLogoBase64();
  const sig = teacherSignatureDataUrl ?? await loadSignatureDataUrl(enrollment.teacherId);
  const adminSig = adminSignatureDataUrl ?? await loadAdminSignature();
  const schoolCert = schoolCertOverride !== undefined
    ? schoolCertOverride
    : (enrollment.coBranded ? await loadSchoolCert(enrollment.schoolId) : null);

  drawCertificate(doc, enrollment, logo, sig, adminSig, schoolCert);

  if (outputMode === 'dataurl') return doc.output('datauristring');

  const safeName = enrollment.studentName.replace(/[^a-z0-9]/gi, '_');
  doc.save(`Certificate_${safeName}_${certificateId(enrollment)}.pdf`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: render many certificates to PDF byte arrays WITHOUT zipping or
// downloading. Loads each teacher's saved signature (cached) + the shared admin
// signature + per-school co-branding. Returns one { name, bytes } per input,
// 1:1 and in input order (so callers can align by index). onProgress(done,total)
// drives a progress bar. Shared by generateCertificatesZIP and bulk export.
// ─────────────────────────────────────────────────────────────────────────────
export const renderCertificatePDFs = async (
  enrollments: CertInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ name: string; bytes: Uint8Array }[]> => {
  if (typeof (window as any).jspdf === 'undefined') {
    alert('PDF Library loading… please wait or refresh.');
    return [];
  }
  if (enrollments.length === 0) return [];

  const { jsPDF } = (window as any).jspdf;
  const logo = await loadLogoBase64();
  const adminSig = await loadAdminSignature();

  // Preload each teacher's signature once (cache by teacherId).
  const sigCache = new Map<string, string | undefined>();
  for (const e of enrollments) {
    if (e.teacherId && !sigCache.has(e.teacherId)) {
      sigCache.set(e.teacherId, await loadSignatureDataUrl(e.teacherId));
    }
  }
  // Preload co-branding config per school (cache by schoolId).
  const schoolCertCache = new Map<string, SchoolCertificateConfig | null>();
  for (const e of enrollments) {
    if (e.coBranded && e.schoolId && !schoolCertCache.has(e.schoolId)) {
      schoolCertCache.set(e.schoolId, await loadSchoolCert(e.schoolId));
    }
  }

  const out: { name: string; bytes: Uint8Array }[] = [];
  const used = new Set<string>();
  const total = enrollments.length;

  enrollments.forEach((e, idx) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const schoolCert = e.coBranded && e.schoolId ? schoolCertCache.get(e.schoolId) ?? null : null;
    drawCertificate(doc, e, logo, e.teacherId ? sigCache.get(e.teacherId) : undefined, adminSig, schoolCert);

    // Unique filename per certificate
    const safe = e.studentName.replace(/[^a-z0-9]/gi, '_');
    let name = `Certificate_${safe}_${certificateId(e)}.pdf`;
    if (used.has(name)) name = `Certificate_${safe}_${certificateId(e)}_${idx}.pdf`;
    used.add(name);

    out.push({ name, bytes: new Uint8Array(doc.output('arraybuffer')) });
    onProgress?.(idx + 1, total);
  });

  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: many certificates → one ZIP, one PDF file per enrollment/student.
// onProgress(done, total) lets callers drive a progress bar.
// ─────────────────────────────────────────────────────────────────────────────
export const generateCertificatesZIP = async (
  enrollments: CertInput[],
  fileLabel = 'Certificates',
  onProgress?: (done: number, total: number) => void,
): Promise<void> => {
  const JSZip = (window as any).JSZip;
  if (!JSZip) { alert('JSZip library not loaded — please refresh.'); return; }
  if (enrollments.length === 0) return;

  const pdfs = await renderCertificatePDFs(enrollments, onProgress);
  if (pdfs.length === 0) return;

  const zip = new JSZip();
  pdfs.forEach(({ name, bytes }) => zip.file(name, bytes));

  const blob: Blob = await zip.generateAsync({ type: 'blob' });
  const dateTag = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileLabel}_${enrollments.length}_${dateTag}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
