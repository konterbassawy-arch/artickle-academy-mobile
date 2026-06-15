/**
 * AI Summary + Report entry point — Phase AI.1 / AI.2
 *
 * AI.1: generateSummary() — deterministic fallback, teacher-only draft summary
 * AI.2: generateReport()  — Cloud Function → Claude, two report types
 *
 * NO writes. NO Firestore. Display only.
 */

import { SummaryInput } from './types';
import { getAISummaryProvider, AISummaryResult } from './provider';
import { generateDeterministicSummary } from './deterministicSummary';
import { buildTeacherPrompt } from './prompts/teacher';

export type { SummaryInput, SummaryMode, SummaryAudience } from './types';
export type { ReportType, AIReport } from './reportTypes';
export { buildSummaryInput } from './buildSummaryInput';
export type { BuildSummaryInputOptions } from './buildSummaryInput';
export { generateReport } from './generateReport';

export async function generateSummary(input: SummaryInput): Promise<AISummaryResult> {
  const provider = getAISummaryProvider();

  if (provider.isAvailable) {
    try {
      const prompt = input.audience === 'teacher'
        ? buildTeacherPrompt(input)
        : buildTeacherPrompt(input);
      return await provider.generate(prompt);
    } catch {
      // Provider failed — fall through to deterministic
    }
  }

  // Deterministic fallback (AI.1 always lands here)
  const text = generateDeterministicSummary(input);
  return { text, source: 'deterministic', providerName: 'none' };
}
