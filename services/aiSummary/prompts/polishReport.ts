/**
 * Polish Report prompt builder — Phase AI.2
 *
 * Rewrites teacher lesson notes into structured bullet points.
 * Rules: same meaning only, no invention, professional language.
 */

import { SummaryInput } from '../types';
import { AISummaryPrompt } from '../provider';

export function buildPolishReportPrompt(
  input: SummaryInput,
  anchor?: { label: string; text: string },
): AISummaryPrompt {
  const noteLines: string[] = [];
  input.recentLessons.slice(0, 8).forEach(l => {
    if (l.notes) noteLines.push(`- [${l.date}] ${l.notes}`);
  });

  const hasNotes = noteLines.length > 0;

  const { present, taught, absentExcused, absentUnexcused, cancelled, totalAll } = input.attendance;
  const totalScheduled = totalAll - cancelled;
  const attended = present + taught;
  const totalAbsent = absentExcused + absentUnexcused;

  const attendanceLines: string[] = [
    `Lessons scheduled: ${totalScheduled}`,
    `Lessons attended: ${attended}`,
    ...(totalAbsent > 0 ? [`Lessons absent: ${totalAbsent}`] : []),
  ];

  const userContent = [
    `Student: ${input.studentFullName}`,
    `Instrument: ${input.instrument}`,
    ...(input.yearGrade ? [`Year/Grade: ${input.yearGrade}`] : []),
    ...(input.schoolName ? [`School: ${input.schoolName}`] : []),
    '',
    ...attendanceLines,
    '',
    hasNotes
      ? `Recent lesson notes (oldest to newest):\n${noteLines.join('\n')}`
      : 'No lesson notes recorded yet.',
    ...(anchor ? [
      '',
      `--- Existing ${anchor.label} for this student (for consistency) ---`,
      anchor.text,
    ] : []),
  ].join('\n');

  const consistencyClause = anchor ? `

CONSISTENCY WITH THE EXISTING ${anchor.label.toUpperCase()}:
- An existing ${anchor.label} for this student is included at the end of the input.
- Treat the lesson notes, attendance, and all other data above as your PRIMARY basis.
- Ensure your observations and conclusions are consistent with that report — describe the same overall picture of the student and do NOT contradict it.
- Do not copy its wording or structure; express the shared ideas in your own required format.
- This is an alignment reference only — it does not relax any of the fabrication or formatting rules below.` : '';

  return {
    system: `You are a professional music educator rewriting lesson notes into a structured, parent-facing progress summary.${consistencyClause}

Your tone must always be:
- Supportive and encouraging
- Neutral and non-judgmental
- Focused on student development and learning

Output EXACTLY this structure:

Overview:
** [One professional sentence summarising overall progress.]

Key Progress Points:
** • [Specific observation from the notes]
• [Specific observation from the notes]
• [Specific observation from the notes, if applicable]

Areas for Development:
** • [A broad area or theme the student could benefit from exploring further, based on the notes]
• [A second area if relevant]

Strict Rules:
- Each body paragraph MUST start with ** (double asterisks followed by a space) to mark it as AI-generated. Do NOT put ** at the end of paragraphs. Do NOT use markdown bold formatting like **text** — only use ** as a prefix at the start of body content.
- Do NOT put ** on section headers (Overview:, Key Progress Points:, Areas for Development:) or on the Student/Instrument/School lines.
- ABSOLUTE RULE — NO FABRICATION: Use ONLY facts explicitly stated in the provided data. Do NOT invent, assume, or infer anything not present. Specifically:
  → Do NOT describe a skill level (e.g. "intermediate", "advanced", "foundational") unless the data explicitly states it
  → Do NOT claim the student is working on specific techniques unless the lesson notes mention them
  → Do NOT describe the student's engagement, attitude, or effort unless the notes explicitly comment on it
  → If the data is sparse, write a shorter report based only on what is actually there. It is better to say less than to fabricate.
- Write in third person — use the student's name or "the student" only. Never use "he", "she", or "they".
- Do NOT mention dates, finances, or raw statistics
- If attendance or missed lessons are mentioned:
  → Reframe them neutrally and constructively
  → Avoid negative or disciplinary language (e.g. "unexcused", "missed repeatedly")
  → Emphasise continuity of learning instead
- Always prioritise growth, effort, and musical development
- Keep language clear, calm, and academic but warm
- "Areas for Development" should read as general growth suggestions — NOT as promises or commitments. Use language like "would benefit from", "continuing to explore", "further development in" — never "will do" or "next lesson"
- If no notes exist, respond with exactly: "No lesson notes have been recorded yet."`,
    user: userContent,
  };
}
