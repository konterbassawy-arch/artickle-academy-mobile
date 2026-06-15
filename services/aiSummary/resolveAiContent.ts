/**
 * resolveAiContent — extract structured sections and scores from a term_report AI output.
 *
 * The term_report prompt emits EXACTLY this structure:
 *
 *   SCORES:
 *   Technical Work: X/10
 *   Practical Work: X/20
 *   Practice: X/10
 *
 *   Technical Work:
 *   [text]
 *
 *   Practical Work:
 *   [text]
 *
 *   Practice:
 *   [text]
 *
 *   General Comment:
 *   [text]
 *
 * Falls back to "—" for missing sections and null for missing scores.
 */

import { TermReportScores } from './reportTypes';

export interface TermReportSections {
  technicalWork:  string;
  practicalWork:  string;
  practiceAtHome: string;
  generalComment: string;
}

export interface ParsedTermReport {
  sections: TermReportSections;
  /** AI-suggested scores — null if the AI didn't output them or they couldn't be parsed */
  suggestedScores: TermReportScores | null;
}

// All four expected headers in document order
const HEADERS: Array<[keyof TermReportSections, string]> = [
  ['technicalWork',  'Technical Work'],
  ['practicalWork',  'Practical Work'],
  ['practiceAtHome', 'Practice'],
  ['generalComment', 'General Comment'],
];

const LOOKAHEAD = HEADERS.map(([, h]) => h.replace(/\s+/g, '\\s+')).join('|');

/**
 * Parse the raw AI term-report text into four typed sections.
 * Returns "—" for any section that the AI omitted or that cannot be parsed.
 */
export function resolveTermReportSections(text: string): TermReportSections {
  return parseTermReport(text).sections;
}

/**
 * Full parse: sections + AI-suggested scores.
 */
export function parseTermReport(text: string, attendanceRate?: number): ParsedTermReport {
  const sections: TermReportSections = {
    technicalWork:  '—',
    practicalWork:  '—',
    practiceAtHome: '—',
    generalComment: '—',
  };

  // Strip the SCORES block before parsing sections (so it doesn't bleed into section text)
  const scoresBlockRx = /SCORES:\s*([\s\S]*?)\n\n/i;
  const scoresMatch = text.match(scoresBlockRx);
  let suggestedScores: TermReportScores | null = null;

  if (scoresMatch) {
    const block = scoresMatch[1];
    const techMatch     = block.match(/Technical Work:\s*(\d+)\s*\/\s*10/i);
    const practMatch    = block.match(/Practical Work:\s*(\d+)\s*\/\s*20/i);
    const practiceMatch = block.match(/Practice:\s*(\d+)\s*\/\s*10/i);

    if (techMatch && practMatch && practiceMatch) {
      const technical = Math.min(10, Math.max(0, parseInt(techMatch[1], 10)));
      const practical = Math.min(20, Math.max(0, parseInt(practMatch[1], 10)));
      const practice  = Math.min(10, Math.max(0, parseInt(practiceMatch[1], 10)));
      suggestedScores = { technical, practical, practice };

      // Enforce minimum total score floor
      const floor = (attendanceRate !== undefined && attendanceRate >= 75) ? 30 : 28;
      const total = technical + practical + practice;
      if (total < floor) {
        const deficit = floor - total;
        // Distribute deficit: prefer practical (max 20), then technical, then practice
        let addPractical = Math.min(deficit, 20 - practical);
        let remaining = deficit - addPractical;
        let addTechnical = Math.min(remaining, 10 - technical);
        remaining -= addTechnical;
        let addPractice = Math.min(remaining, 10 - practice);
        suggestedScores = {
          technical: technical + addTechnical,
          practical: practical + addPractical,
          practice: practice + addPractice,
        };
      }
    }
  }

  // Parse section bodies (from the text after the SCORES block)
  const bodyText = scoresMatch ? text.slice(scoresMatch.index! + scoresMatch[0].length) : text;

  for (const [key, header] of HEADERS) {
    const safeHeader = header.replace(/\s+/g, '\\s+');
    const rx = new RegExp(
      `${safeHeader}:\\s*([\\s\\S]*?)(?=(?:${LOOKAHEAD}):|$)`,
      'i',
    );
    const match = bodyText.match(rx);
    if (match) {
      const body = match[1].trim();
      if (body) sections[key] = body;
    }
  }

  return { sections, suggestedScores };
}
