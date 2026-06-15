/**
 * schoolCertificate.ts
 *
 * Per-school certificate branding (logo + signatories), stored as base64 in
 * Firestore at schoolCertificates/{schoolId}. Base64 (not Storage URLs) so the
 * jsPDF certificate can embed images without CORS issues — same pattern as
 * teacherSignatures/{teacherId}. The Storage bucket is locked deny-all.
 */

// @ts-ignore — CDN imports (match certificateExport.ts)
import { getFirestore, doc as firestoreDoc, getDoc as firestoreGetDoc, setDoc as firestoreSetDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
// @ts-ignore
import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

/** A signatory printed in the certificate footer (e.g. Head of Music). */
export interface SchoolSignatory {
  /** Role caption under the line, e.g. "Head of Music". */
  title: string;
  /** Printed name, e.g. "Dr. Sara Khan". */
  name: string;
  /** Optional handwritten-signature PNG as a base64 data URL. */
  signatureBase64?: string;
}

export type LogoBackdrop = 'none' | 'white' | 'dark';

export interface SchoolCertificateConfig {
  /** School logo PNG as a base64 data URL (shown beside the Artickle logo). */
  logoBase64?: string;
  /** Backdrop card behind the centre logos: 'none' (transparent), 'white', or 'dark'.
   *  Lets schools whose logo has white text (e.g. King's College) pick 'dark'. */
  logoBackdrop?: LogoBackdrop;
  /** Visual size multiplier for the school logo so it can be matched to the Artickle
   *  mark (logos have different padding/proportions). 1 = default. Range ~0.6–1.4. */
  logoScale?: number;
  /** 0–2 school signatories shown in the footer. */
  signatories?: SchoolSignatory[];
}

export async function loadSchoolCertificateConfig(
  schoolId: string,
): Promise<SchoolCertificateConfig | null> {
  if (!schoolId) return null;
  try {
    const db = getFirestore(getApp());
    const snap = await firestoreGetDoc(firestoreDoc(db, 'schoolCertificates', schoolId));
    return snap.exists() ? (snap.data() as SchoolCertificateConfig) : null;
  } catch {
    return null;
  }
}

export async function saveSchoolCertificateConfig(
  schoolId: string,
  cfg: SchoolCertificateConfig,
): Promise<void> {
  const db = getFirestore(getApp());
  // Drop undefined fields — Firestore rejects them.
  const clean: SchoolCertificateConfig = {};
  if (cfg.logoBase64) clean.logoBase64 = cfg.logoBase64;
  if (cfg.logoBackdrop && cfg.logoBackdrop !== 'none') clean.logoBackdrop = cfg.logoBackdrop;
  if (typeof cfg.logoScale === 'number' && cfg.logoScale !== 1) clean.logoScale = cfg.logoScale;
  if (cfg.signatories && cfg.signatories.length) {
    clean.signatories = cfg.signatories
      .filter(s => s.name?.trim() || s.title?.trim() || s.signatureBase64)
      .map(s => ({
        title: s.title?.trim() ?? '',
        name: s.name?.trim() ?? '',
        ...(s.signatureBase64 ? { signatureBase64: s.signatureBase64 } : {}),
      }));
  }
  await firestoreSetDoc(firestoreDoc(db, 'schoolCertificates', schoolId), clean);
}
