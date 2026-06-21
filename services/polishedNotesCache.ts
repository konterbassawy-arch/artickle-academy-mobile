/**
 * polishedNotesCache — cached, incremental AI note-polishing for PDF export.
 *
 * The only slow part of bulk export is the AI "polish lesson notes" call, which
 * runs once per student for the Progress Review. This module caches each lesson's
 * polished text on the lesson document itself (polishedNote + polishedNoteHash),
 * keyed by a hash of the source text. On re-export:
 *   - unchanged notes  → reuse the cached polished text (no read, no AI call)
 *   - new/edited notes → re-polished, and only those genuinely polished are
 *                        written back to Firestore (best-effort).
 *
 * Net effect: the first export warms the cache (slow once); subsequent exports
 * with no edited notes make ZERO AI calls and are near-instant.
 */

import { getApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { Lesson } from '../types';
import { batchPolishForPdfStatus } from './aiSummary/rewriteText';

/** Source text a lesson's polished note is built from (learning | notes). */
const sourceText = (l: Lesson): string => [l.learning, l.notes].filter(Boolean).join(' | ');

/** Stable, fast hash of the note source text — djb2 → base36. */
export function hashNoteText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0; // h * 33 + c
  }
  return (h >>> 0).toString(36);
}

/**
 * Resolve polished note text for a set of lessons, reusing the cache where the
 * source text is unchanged and polishing only the stale ones. Genuinely-polished
 * results are written back to each lesson doc (best-effort). Returns a map of
 * lessonId → polished text (originals when polish is unavailable).
 */
export async function resolvePolishedNotes(lessons: Lesson[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const stale: Array<{ id: string; text: string }> = [];

  for (const l of lessons) {
    const text = sourceText(l);
    if (!text) continue;
    const hash = hashNoteText(text);
    if (l.polishedNoteHash === hash && l.polishedNote != null) {
      // Cache hit — no read, no AI call.
      result.set(l.id, l.polishedNote);
    } else {
      // Seed with the original so the map always has an entry; overwrite if polished.
      result.set(l.id, text);
      stale.push({ id: l.id, text });
    }
  }

  if (stale.length === 0) return result;

  const { texts, polished } = await batchPolishForPdfStatus(stale);

  // Apply polished text and write back ONLY the ones the AI genuinely returned.
  const db = getFirestore(getApp());
  for (const { id } of stale) {
    const text = texts.get(id);
    if (text != null) result.set(id, text);
    if (polished.has(id) && text != null) {
      const source = stale.find(s => s.id === id)!.text;
      try {
        await updateDoc(doc(db, 'lessons', id), {
          polishedNote: text,
          polishedNoteHash: hashNoteText(source),
        });
      } catch {
        // best-effort — caching failure must never break export
      }
    }
  }

  return result;
}
