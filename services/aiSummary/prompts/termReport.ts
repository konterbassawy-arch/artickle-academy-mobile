/**
 * Term Report prompt builder — Phase AI.3
 *
 * Generates a structured formal academic report with 4 sections:
 *   Technical Work / Practical Work / Practice / General Comment
 *
 * Also outputs AI-suggested scores (not printed — shown as suggestions in the UI):
 *   Technical Work: X/10
 *   Practical Work: X/20
 *   Practice: X/10
 *
 * Score logic:
 *   - Lesson effort/practice ratings are a starting point only.
 *   - If teacher notes mention lack of practice, low engagement, or repeated absences,
 *     scores are adjusted downward regardless of raw ratings.
 *   - Attendance rate significantly influences Practice score.
 *   - Do NOT mention the scores anywhere in the written comments.
 */

import { SummaryInput } from '../types';
import { AISummaryPrompt } from '../provider';

function serializeForTermReport(input: SummaryInput): string {
  const lines: string[] = [];

  lines.push(`Student: ${input.studentFullName}`);
  lines.push(`Instrument: ${input.instrument}`);
  if (input.yearGrade)  lines.push(`Year/Grade: ${input.yearGrade}`);
  if (input.schoolName) lines.push(`School: ${input.schoolName}`);
  lines.push('');

  if (input.currentPeriod) {
    const p = input.currentPeriod;
    lines.push(`Term: ${p.name} (${p.startDate} to ${p.endDate})`);
    lines.push(`Lessons completed: ${p.consumedLessons} of ${p.totalLessons} (${p.lessonPercent}%)`);
    lines.push('');
  }

  const { present, taught, absentExcused, absentUnexcused, cancelled, totalAll } = input.attendance;
  const totalScheduled = totalAll - cancelled;
  const attended = present + taught;
  const totalAbsent = absentExcused + absentUnexcused;
  const realAttendanceRate = totalScheduled > 0 ? Math.round((attended / totalScheduled) * 100) : 0;
  lines.push(`Total lessons scheduled: ${totalScheduled}`);
  lines.push(`Lessons attended: ${attended}`);
  lines.push(`Lessons absent: ${totalAbsent}`);
  if (absentExcused > 0)   lines.push(`  Excused absences: ${absentExcused}`);
  if (absentUnexcused > 0) lines.push(`  Unexcused absences: ${absentUnexcused}`);
  if (cancelled > 0)       lines.push(`  Cancelled: ${cancelled}`);
  lines.push(`Attendance rate (attended / scheduled): ${realAttendanceRate}%`);
  lines.push(`Trend: ${input.signals.trend}`);
  lines.push('');

  if (input.signals.latestEvaluation)         lines.push(`Latest grade level: ${input.signals.latestEvaluation}`);
  if (input.signals.latestRepertoire)         lines.push(`Current repertoire: ${input.signals.latestRepertoire}`);
  if (input.signals.latestPracticeAssignment) lines.push(`Latest practice assignment: ${input.signals.latestPracticeAssignment}`);
  lines.push('');

  // Include all lessons for full picture (attendance + content)
  const detailedLessons = input.recentLessons;
  if (detailedLessons.length > 0) {
    lines.push('Lesson details (most recent first):');
    detailedLessons.slice(0, 12).forEach(l => {
      const parts: string[] = [l.date, `status: ${l.status}`];
      if (l.evaluation)        parts.push(`grade: ${l.evaluation}`);
      if (l.repertoire)        parts.push(`piece: ${l.repertoire}`);
      if (l.practiceAssignment) parts.push(`practice: ${l.practiceAssignment}`);
      if (l.notes)             parts.push(`notes: "${l.notes}"`);
      lines.push(`  ${parts.join(' | ')}`);
    });
    lines.push('');
  }

  if (input.recentTeacherNotes.length > 0) {
    lines.push('Teacher notes (recent):');
    input.recentTeacherNotes.slice(0, 5).forEach((n, i) => {
      lines.push(`  ${i + 1}. ${n}`);
    });
  }

  return lines.join('\n');
}

export function buildTermReportPrompt(
  input: SummaryInput,
  anchor?: { label: string; text: string },
): AISummaryPrompt {
  const periodName = input.currentPeriod?.name ?? 'this enrollment period';
  const consistencyClause = anchor ? `

CONSISTENCY WITH THE EXISTING ${anchor.label.toUpperCase()}:
- An existing ${anchor.label} for this student is included at the end of the input.
- Treat the lesson data, attendance, ratings, and all other factors above as your PRIMARY basis (including for the SCORES).
- Ensure your written observations and conclusions are consistent with that report — describe the same overall picture of the student and do NOT contradict it.
- Do not copy its wording or structure; express the shared ideas in your own required format.
- This is an alignment reference only — it does not relax any of the fabrication, scoring, or formatting rules below.` : '';
  return {
    system: `You are a professional music teacher writing a formal academic report for parents covering the enrollment period named "${periodName}".${consistencyClause}

When referring to the enrollment period in your writing, use the name "${periodName}" (e.g. "during ${periodName}", "throughout ${periodName}"). Do NOT use generic words like "term", "semester", or "period" — always use the actual enrollment name.

Tone requirements:
- Calm, balanced, and academically professional
- Supportive and constructive at all times
- Never critical, blaming, or emotionally charged
- Written to inform and guide, not to judge

Output EXACTLY this structure — no extra text, no deviations:

SCORES:
Technical Work: [number]/10
Practical Work: [number]/20
Practice: [number]/10

Technical Work:
** [2–3 sentences]

Practical Work:
** [2–3 sentences]

Practice:
** [2–3 sentences]

General Comment:
** [2–3 sentences]

Rules for the SCORES block:
- Scores are your honest professional assessment — NOT necessarily equal to the raw effort/practice ratings
- Weigh lesson notes and comments heavily: if notes mention the student wasn't practicing, didn't prepare pieces, or was disengaged, reduce the relevant score even if the teacher gave 5/5 ratings
- Attendance rate directly impacts Practice score:
  → attendance ≥ 90%: no penalty
  → attendance 70–89%: reduce Practice by 1–2 points
  → attendance < 70%: reduce Practice by 2–4 points
- Output only integer scores within the allowed range (Technical: 0–10, Practical: 0–20, Practice: 0–10)
- MINIMUM TOTAL SCORE FLOOR:
  → If attendance ≥ 75%: the total (Technical + Practical + Practice) must be at least 30 out of 40
  → If attendance < 75%: the total must be at least 28 out of 40
  → Never output a total below these floors — redistribute points upward if needed

Rules for the written sections:
- Each section body MUST start with ** (double asterisks followed by a space) to mark it as AI-generated. Do NOT put ** at the end of paragraphs. Do NOT use markdown bold formatting like **text** — only use ** as a prefix at the start of body content.
- 2–3 sentences per section
- Under 300 words total across all four sections
- One continuous paragraph per section — no line breaks within a section
- Use the student's first name throughout (e.g. "Adam has shown…")
- ABSOLUTE RULE — NO FABRICATION: Use ONLY facts explicitly stated in the provided data. Do NOT invent, assume, or infer anything not present. Specifically:
  → Do NOT describe a skill level (e.g. "intermediate", "advanced", "foundational") unless the data explicitly states it
  → Do NOT claim the student is working on specific techniques unless the lesson notes or grades mention them
  → Do NOT describe the student's engagement, attitude, or effort unless the teacher notes explicitly comment on it
  → If the data is sparse, write a shorter report based only on what is actually there. It is better to say less than to fabricate.
- CRITICAL: If the student has ANY absences (excused or unexcused), you MUST NOT say they "attended all lessons" or had "perfect attendance." State attendance accurately. If 4 out of 6 lessons were attended, say so. Never exaggerate or fabricate positive attendance.
- Do NOT mention scores, numbers, or ratings in the written sections
- Do not include financial information, medical assessments, or comparative rankings

Critical tone rules:
- When referring to attendance or missed lessons:
  → Present it factually but gently
  → Avoid words like "unexcused", "poor attendance", "issue"
  → Use neutral phrasing like: "attendance has been generally consistent, with a small number of missed lessons"
  → If relevant, connect attendance to learning continuity, not behaviour
- Always frame observations in terms of learning impact and development
- End the General Comment with a forward-looking and encouraging statement`,
    user: anchor
      ? `${serializeForTermReport(input)}\n\n--- Existing ${anchor.label} for this student (for consistency) ---\n${anchor.text}`
      : serializeForTermReport(input),
  };
}
