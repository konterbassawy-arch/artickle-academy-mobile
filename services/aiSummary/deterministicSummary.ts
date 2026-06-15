/**
 * deterministicSummary — Phase AI.1
 *
 * Template-based summary generator — no API required.
 * Produces useful, readable output from SummaryInput for both modes.
 *
 * Modes:
 *   polish — flowing prose paragraph (lesson progress narrative)
 *   term   — structured summary with labelled sections (attendance, progress, notes)
 *
 * NO writes. NO external calls. Pure function.
 */

import { SummaryInput } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function trendPhrase(trend: SummaryInput['signals']['trend']): string {
  switch (trend) {
    case 'improving':          return 'showing notable improvement';
    case 'steady':             return 'progressing steadily';
    case 'declining':          return 'facing some challenges recently';
    case 'insufficient_data':  return 'still building a lesson history';
  }
}

function attendanceLine(input: SummaryInput): string {
  const { present, taught, absentExcused, absentUnexcused, totalConsumed } = input.attendance;
  const attended = present + taught;
  const parts: string[] = [];
  if (present > 0)          parts.push(`${present} present`);
  if (taught > 0)           parts.push(`${taught} taught`);
  if (absentExcused > 0)    parts.push(`${absentExcused} excused absence${absentExcused > 1 ? 's' : ''}`);
  if (absentUnexcused > 0)  parts.push(`${absentUnexcused} unexcused absence${absentUnexcused > 1 ? 's' : ''}`);
  if (parts.length === 0)   return 'No lesson records yet.';
  return `${attended} of ${totalConsumed} consumed lessons attended (${parts.join(', ')}).`;
}

function evalLine(input: SummaryInput): string {
  const { latestEvaluation, latestRepertoire, latestPracticeAssignment } = input.signals;
  const parts: string[] = [];
  if (latestEvaluation)          parts.push(`grade level: ${latestEvaluation}`);
  if (latestRepertoire)          parts.push(`working on ${latestRepertoire}`);
  if (latestPracticeAssignment)  parts.push(`practice: ${latestPracticeAssignment}`);
  if (parts.length === 0)        return '';
  return parts.join('; ');
}

function periodLine(input: SummaryInput): string {
  const p = input.currentPeriod;
  if (!p) return '';
  return `${p.consumedLessons} of ${p.totalLessons} lessons completed (${pct(p.lessonPercent)}) in ${p.name}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polish mode — flowing prose
// ─────────────────────────────────────────────────────────────────────────────

function generatePolish(input: SummaryInput): string {
  const { studentFirstName, instrument, yearGrade, signals, attendance } = input;

  const gradeClause = yearGrade ? ` (Year ${yearGrade})` : '';
  const intro = `${studentFirstName}${gradeClause} is learning ${instrument} and is ${trendPhrase(signals.trend)}.`;

  const periodClause = periodLine(input);
  const attendanceSentence = (() => {
    const { present, taught, absentUnexcused, totalConsumed } = attendance;
    const attended = present + taught;
    if (totalConsumed === 0) return 'No lessons recorded yet.';
    const attPct = pct(signals.attendanceRate);
    const missedNote = absentUnexcused > 0
      ? ` ${absentUnexcused} unexcused absence${absentUnexcused > 1 ? 's' : ''} noted.`
      : '';
    return `Attendance is ${attPct} (${attended} of ${totalConsumed} lessons).${missedNote}`;
  })();

  const evalClause = evalLine(input);
  const evalSentence = evalClause
    ? `Most recent evaluation — ${evalClause}.`
    : '';

  const notesSentence = (() => {
    if (!input.recentTeacherNotes.length) return '';
    const latest = input.recentTeacherNotes[0];
    const trimmed = latest.length > 120 ? latest.slice(0, 120).trimEnd() + '…' : latest;
    return `Latest lesson note: "${trimmed}"`;
  })();

  const sections = [intro, periodClause, attendanceSentence, evalSentence, notesSentence]
    .filter(Boolean);

  return sections.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Term mode — structured sections
// ─────────────────────────────────────────────────────────────────────────────

function generateTerm(input: SummaryInput): string {
  const { studentFirstName, instrument, yearGrade, signals, attendance } = input;
  const gradeClause = yearGrade ? ` · Year ${yearGrade}` : '';
  const lines: string[] = [];

  lines.push(`STUDENT: ${studentFirstName}${gradeClause} · ${instrument}`);
  lines.push('');

  // Period
  if (input.currentPeriod) {
    const p = input.currentPeriod;
    lines.push(`TERM PROGRESS (${p.name})`);
    lines.push(`  Lessons: ${p.consumedLessons} / ${p.totalLessons} (${pct(p.lessonPercent)})`);
    if (p.totalMinutes > 0) {
      const hrs = (p.consumedMinutes / 60).toFixed(1);
      const totalHrs = (p.totalMinutes / 60).toFixed(1);
      lines.push(`  Minutes: ${p.consumedMinutes} / ${p.totalMinutes} (${hrs}h / ${totalHrs}h — ${pct(p.minutesPercent)})`);
    }
    lines.push('');
  }

  // Attendance
  lines.push('ATTENDANCE');
  lines.push(`  ${attendanceLine(input)}`);
  if (attendance.totalConsumed > 0) {
    lines.push(`  Rate: ${pct(signals.attendanceRate)}`);
  }
  if (attendance.cancelled > 0) {
    lines.push(`  Cancelled: ${attendance.cancelled}`);
  }
  lines.push('');

  // Progress
  lines.push('PROGRESS');
  lines.push(`  Trend: ${trendPhrase(signals.trend)}`);
  const ev = evalLine(input);
  if (ev) lines.push(`  Latest: ${ev}`);
  if (!ev) lines.push('  No graded evaluations recorded yet.');
  lines.push('');

  // Historical
  if (input.historicalPeriods.length > 0) {
    lines.push('PREVIOUS TERMS');
    for (const p of input.historicalPeriods.slice(0, 3)) {
      lines.push(`  ${p.name}: ${p.consumedLessons}/${p.totalLessons} lessons (${pct(p.lessonPercent)}), ${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`);
    }
    lines.push('');
  }

  // Teacher notes
  if (input.recentTeacherNotes.length > 0) {
    lines.push('RECENT NOTES');
    input.recentTeacherNotes.slice(0, 3).forEach((note, i) => {
      const trimmed = note.length > 150 ? note.slice(0, 150).trimEnd() + '…' : note;
      lines.push(`  ${i + 1}. ${trimmed}`);
    });
    lines.push('');
  }

  lines.push(`Generated: ${new Date(input.generatedAt).toLocaleString()}`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateDeterministicSummary(input: SummaryInput): string {
  return input.mode === 'term'
    ? generateTerm(input)
    : generatePolish(input);
}
