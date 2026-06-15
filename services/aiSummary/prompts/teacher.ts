/**
 * Teacher audience prompt builder — Phase AI.1 (ready for AI.2)
 *
 * Builds the system + user prompt for a teacher-facing summary.
 * This file is wired up now but unused until AI.2 connects a live provider.
 *
 * Tone: professional, concise, internal (teacher is reviewing their own student).
 * Forbidden: medical/psych claims, comparative rankings, financial advice.
 */

import { SummaryInput } from '../types';
import { AISummaryPrompt } from '../provider';

function serializeInput(input: SummaryInput): string {
  const lines: string[] = [];

  lines.push(`Student: ${input.studentFullName}`);
  lines.push(`Instrument: ${input.instrument}`);
  if (input.yearGrade)   lines.push(`Year/Grade: ${input.yearGrade}`);
  if (input.schoolName)  lines.push(`School: ${input.schoolName}`);
  lines.push('');

  if (input.currentPeriod) {
    const p = input.currentPeriod;
    lines.push(`Current period: ${p.name} (${p.startDate} to ${p.endDate})`);
    lines.push(`  Lessons: ${p.consumedLessons}/${p.totalLessons} (${p.lessonPercent}%)`);
    if (p.totalMinutes > 0) {
      lines.push(`  Minutes: ${p.consumedMinutes}/${p.totalMinutes} (${p.minutesPercent}%)`);
    }
    lines.push('');
  }

  const { present, taught, absentExcused, absentUnexcused, cancelled } = input.attendance;
  lines.push(`Attendance (all lessons)`);
  lines.push(`  Present: ${present}, Taught: ${taught}, Excused: ${absentExcused}, Unexcused: ${absentUnexcused}, Cancelled: ${cancelled}`);
  lines.push(`  Attendance rate: ${input.attendance.attendanceRate}%`);
  lines.push('');

  lines.push(`Overall trend: ${input.signals.trend}`);
  if (input.signals.latestEvaluation)        lines.push(`Latest grade level: ${input.signals.latestEvaluation}`);
  if (input.signals.latestRepertoire)        lines.push(`Current repertoire: ${input.signals.latestRepertoire}`);
  if (input.signals.latestPracticeAssignment) lines.push(`Practice assignment: ${input.signals.latestPracticeAssignment}`);
  lines.push('');

  if (input.recentTeacherNotes.length > 0) {
    lines.push('Recent teacher notes:');
    input.recentTeacherNotes.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
    lines.push('');
  }

  if (input.recentLessons.length > 0) {
    lines.push('Last 5 lessons:');
    input.recentLessons.slice(0, 5).forEach(l => {
      const parts = [`${l.date} — ${l.status} (${l.durationMinutes}min)`];
      if (l.evaluation) parts.push(`grade: ${l.evaluation}`);
      if (l.repertoire) parts.push(`piece: ${l.repertoire}`);
      lines.push(`  ${parts.join(', ')}`);
    });
  }

  return lines.join('\n');
}

export function buildTeacherPrompt(input: SummaryInput): AISummaryPrompt {
  const modeInstruction = input.mode === 'term'
    ? 'Write a structured term summary with clear sections: Progress, Attendance, Notable observations, Recommended focus.'
    : 'Write a concise flowing paragraph (3–5 sentences) summarising this student\'s recent progress and attendance.';

  return {
    system: `You are a music education assistant helping a teacher write internal student progress notes.
Write in a professional, warm, and factual tone.
Use only the data provided — do not invent observations, scores, or dates.
Do not include medical or psychological assessments, financial information, or comparative rankings.
Keep the summary under 200 words unless the structured term format requires more.
${modeInstruction}`,
    user: serializeInput(input),
  };
}
