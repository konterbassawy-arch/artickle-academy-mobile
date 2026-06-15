/**
 * generateReport — Phase AI.2 entry point
 *
 * Routes to the Cloud Function provider (Claude) if available, or
 * deterministic fallback if not. Call sites import only this function.
 *
 * Returns AIReport including source and isFallback flags so the UI
 * can show an appropriate banner when the fallback was used unexpectedly.
 *
 * NO Firestore writes. Display only.
 */

import { SummaryInput } from './types';
import { ReportType, AIReport, REPORT_TYPE_LABELS } from './reportTypes';
import { makeClaudeProvider } from './claudeProvider';
import { buildPolishReportPrompt } from './prompts/polishReport';
import { buildTermReportPrompt } from './prompts/termReport';
import { generateDeterministicReport } from './deterministicReport';
import { buildSummaryInput, BuildSummaryInputOptions } from './buildSummaryInput';
import { resolveTermReportSections } from './resolveAiContent';

/**
 * An already-saved report of the OTHER type, supplied so the report being
 * generated stays consistent with it (same observations, no contradictions).
 * It is an ADDITIONAL input — the lesson data and other factors remain the
 * primary basis for the new report.
 */
export interface AnchorReport {
  reportType: ReportType;
  text: string;
}

/** Cleaned, label-prefixed context block built from an anchor report. */
export interface AnchorContext {
  label: string;
  text: string;
}

/**
 * Strip the ** AI markers and (for term reports) the numeric SCORES block,
 * leaving clean prose the model can read as a consistency reference.
 */
function buildAnchorContext(anchor?: AnchorReport): AnchorContext | undefined {
  if (!anchor || !anchor.text || !anchor.text.trim()) return undefined;
  const label = REPORT_TYPE_LABELS[anchor.reportType];

  if (anchor.reportType === 'term_report') {
    const s = resolveTermReportSections(anchor.text);
    const text = [
      `Technical Work: ${s.technicalWork}`,
      `Practical Work: ${s.practicalWork}`,
      `Practice: ${s.practiceAtHome}`,
      `General Comment: ${s.generalComment}`,
    ].join('\n');
    return { label, text };
  }

  // Polish / Progress Review — just remove the ** markers.
  const text = anchor.text.replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { label, text };
}

function buildPrompt(input: SummaryInput, reportType: ReportType, anchor?: AnchorContext) {
  return reportType === 'term_report'
    ? buildTermReportPrompt(input, anchor)
    : buildPolishReportPrompt(input, anchor);
}

export async function generateReport(
  opts: BuildSummaryInputOptions,
  reportType: ReportType,
  anchorReport?: AnchorReport,
): Promise<AIReport> {
  const input = buildSummaryInput({ ...opts, mode: 'polish' }); // mode unused for reports
  const provider = makeClaudeProvider(reportType);
  const anchor = buildAnchorContext(anchorReport);

  if (provider.isAvailable) {
    try {
      const prompt = buildPrompt(input, reportType, anchor);
      const result = await provider.generate(prompt);
      return {
        text: result.text,
        reportType,
        source: 'ai',
        isFallback: false,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // Cloud Function failed — fall through to deterministic
    }
  }

  const text = generateDeterministicReport(input, reportType);
  const isFallback = provider.isAvailable; // true = was configured but failed
  return {
    text,
    reportType,
    source: 'fallback',
    isFallback,
    generatedAt: new Date().toISOString(),
  };
}
