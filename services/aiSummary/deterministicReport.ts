/**
 * deterministicReport — Phase AI.2 fallback
 *
 * Template-based report generator used when the Cloud Function is unavailable.
 * Produces structured, readable output for both report types.
 *
 * NO writes. NO external calls. Pure function.
 */

import { SummaryInput } from './types';
import { ReportType } from './reportTypes';

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polish Report fallback — prose rewrite from available notes
// ─────────────────────────────────────────────────────────────────────────────

function generatePolishReport(input: SummaryInput): string {
  const { studentFirstName, instrument, yearGrade, signals, attendance } = input;
  const gradeClause = yearGrade ? ` (Year ${yearGrade})` : '';

  const trendMap: Record<typeof signals.trend, string> = {
    improving: 'showing encouraging improvement',
    steady: 'maintaining steady progress',
    declining: 'facing some challenges',
    insufficient_data: 'building their lesson history',
  };

  let text = `${studentFirstName}${gradeClause} continues their ${instrument} studies, ${trendMap[signals.trend]}.`;

  if (attendance.totalConsumed > 0) {
    const attended = attendance.present + attendance.taught;
    text += ` Attendance has been ${pct(signals.attendanceRate)} (${attended} of ${attendance.totalConsumed} lessons).`;
    if (attendance.absentUnexcused > 0) {
      text += ` ${attendance.absentUnexcused} unexcused absence${attendance.absentUnexcused > 1 ? 's' : ''} noted.`;
    }
  }

  if (signals.latestRepertoire) {
    text += ` Most recently the student has been working on ${signals.latestRepertoire}.`;
  }

  if (input.recentTeacherNotes.length > 0) {
    const latest = input.recentTeacherNotes[0];
    const trimmed = latest.length > 120 ? latest.slice(0, 120).trimEnd() + '…' : latest;
    text += ` Teacher note: "${trimmed}"`;
  } else {
    text += ' Detailed lesson notes are not yet available.';
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Term Report fallback — structured 4-section output
// ─────────────────────────────────────────────────────────────────────────────

function generateTermReport(input: SummaryInput): string {
  const { studentFirstName, instrument, yearGrade, signals, attendance } = input;
  const gradeClause = yearGrade ? ` (Year ${yearGrade})` : '';

  const trendMap: Record<typeof signals.trend, string> = {
    improving: 'demonstrating improvement across the term',
    steady: 'maintaining a consistent level of progress',
    declining: 'encountering some challenges this term',
    insufficient_data: 'in the early stages of building their musical foundation',
  };

  const lines: string[] = [];

  // Technical Work
  lines.push('Technical Work:');
  if (signals.latestEvaluation) {
    lines.push(`${studentFirstName}${gradeClause} is working at grade level ${signals.latestEvaluation} on ${instrument}.`);
  } else {
    lines.push(`${studentFirstName}${gradeClause} is continuing to develop their technical skills on ${instrument}.`);
  }
  lines.push(`The student is ${trendMap[signals.trend]}.`);
  lines.push('');

  // Practical Work
  lines.push('Practical Work:');
  if (signals.latestRepertoire) {
    lines.push(`The student has been working on ${signals.latestRepertoire}.`);
  } else {
    lines.push('Repertoire selection is ongoing and will be noted in upcoming lesson records.');
  }
  if (input.currentPeriod) {
    const p = input.currentPeriod;
    lines.push(`${p.consumedLessons} of ${p.totalLessons} lessons completed this term (${pct(p.lessonPercent)}).`);
  }
  lines.push('');

  // Practice
  lines.push('Practice:');
  if (signals.latestPracticeAssignment) {
    lines.push(`The most recent practice assignment was: ${signals.latestPracticeAssignment}.`);
  }
  if (attendance.totalConsumed > 0) {
    const attended = attendance.present + attendance.taught;
    lines.push(
      `The student has attended ${attended} of ${attendance.totalConsumed} lessons (${pct(signals.attendanceRate)}), ` +
      `indicating ${signals.attendanceRate >= 80 ? 'good' : signals.attendanceRate >= 60 ? 'moderate' : 'limited'} engagement.`
    );
  } else {
    lines.push('Practice habits and assignment completion will be assessed as lessons progress.');
  }
  lines.push('');

  // General Comment
  lines.push('General Comment:');
  lines.push(`${studentFirstName} is ${trendMap[signals.trend]} in their ${instrument} studies.`);
  if (signals.attendanceRate < 70 && attendance.totalConsumed > 0) {
    lines.push('Improving attendance consistency is recommended to support continued progress.');
  } else if (signals.trend === 'improving') {
    lines.push('The positive momentum is encouraging and should be maintained through regular practice.');
  } else {
    lines.push('Continued dedication to regular practice will support further development.');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateDeterministicReport(input: SummaryInput, reportType: ReportType): string {
  return reportType === 'term_report'
    ? generateTermReport(input)
    : generatePolishReport(input);
}
