/**
 * rewriteText — quick AI polish for short freeform fields (e.g. lesson learning notes).
 *
 * Uses the same Cloud Function proxy as generateReport so the API key never
 * reaches the browser. Falls back to returning the original text if unavailable.
 */

const SYSTEM_PROMPT =
  `You are a professional editor for a music academy. Your only job is to clean up the teacher's raw lesson note.

Rules (strict):
- Fix grammar, spelling, and punctuation only
- Make the language clear and professional
- Keep ALL the same information — do NOT add, expand, explain, or invent anything
- Do NOT change the meaning or add any details not already in the original
- Keep roughly the same length — do not pad or elaborate
- Return ONLY the cleaned text — no preamble, no explanation, no formatting headers
- When referring to the student, use their name or "the student" only — never "he", "she", or "they"`;

const BATCH_SYSTEM_PROMPT =
  `You are a professional editor for a music academy. Clean up each numbered lesson note below.

Rules (strict):
- Fix grammar, spelling, and punctuation only
- Make the language clear and professional
- Do NOT add, expand, explain, or invent any information
- Keep the same meaning and roughly the same length
- Return ONLY the same numbered list — one entry per line, same indices — no extra text or commentary`;

/**
 * Polish all lesson note texts in one Cloud Function call.
 * Used for PDF export — does NOT add the "** " marker.
 * Falls back to original texts silently if unavailable or on error.
 *
 * entries: array of { id, text } — text = combined learning + notes for a lesson.
 * Returns: Map<lessonId, polishedText>.  Original text used when polish fails/empty.
 */
export async function batchPolishForPdf(
  entries: Array<{ id: string; text: string }>,
): Promise<Map<string, string>> {
  return (await batchPolishForPdfStatus(entries)).texts;
}

/**
 * Same as batchPolishForPdf, but ALSO reports which ids the AI genuinely
 * polished (vs. fell back to the original). Callers that cache results use
 * `polished` so they never persist a fallback-to-original as if it were AI work.
 *
 * Returns: { texts: Map<lessonId, text>, polished: Set<lessonId> }
 */
export async function batchPolishForPdfStatus(
  entries: Array<{ id: string; text: string }>,
): Promise<{ texts: Map<string, string>; polished: Set<string> }> {
  // Build default result (originals)
  const texts = new Map<string, string>(entries.map(e => [e.id, e.text]));
  const polished = new Set<string>();

  const url = (import.meta as any).env?.VITE_AI_FUNCTION_URL as string | undefined;
  if (!url) return { texts, polished };

  const withContent = entries.filter(e => e.text.trim());
  if (withContent.length === 0) return { texts, polished };

  const numbered = withContent.map((e, i) => `${i + 1}. ${e.text.trim()}`).join('\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: BATCH_SYSTEM_PROMPT,
        user: numbered,
        reportType: 'polish_report',
      }),
    });
    if (!response.ok) return { texts, polished };

    const data = (await response.json()) as { text?: string };
    if (!data.text) return { texts, polished };

    // Parse numbered lines — each starts with "N."
    const lines = data.text.split('\n').filter(l => /^\s*\d+\.\s/.test(l));
    if (lines.length !== withContent.length) return { texts, polished }; // mismatch → use originals

    lines.forEach((line, i) => {
      const cleaned = line.replace(/^\s*\d+\.\s*/, '').trim();
      if (cleaned) {
        texts.set(withContent[i].id, cleaned);
        polished.add(withContent[i].id);
      }
    });
  } catch {
    // Network or parse error — return originals
  }

  return { texts, polished };
}

export async function rewriteLessonNote(text: string): Promise<string> {
  const url = (import.meta as any).env?.VITE_AI_FUNCTION_URL as string | undefined;
  if (!url || !text.trim()) return text;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      user: text.trim(),
      reportType: 'polish_report',
    }),
  });

  if (!response.ok) throw new Error(`Rewrite failed: ${response.status}`);
  const data = await response.json() as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error('Empty response');
  return '** ' + data.text;
}
