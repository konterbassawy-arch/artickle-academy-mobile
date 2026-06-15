/**
 * claudeProvider — Phase AI.2
 *
 * Calls the Firebase Cloud Function proxy (generateAIReport) to generate
 * AI report text via Claude. The API key never reaches the browser.
 *
 * Configure: set VITE_AI_FUNCTION_URL in your .env to the deployed function URL.
 * Example:   VITE_AI_FUNCTION_URL=https://us-central1-artickle-academy.cloudfunctions.net/generateAIReport
 *
 * If VITE_AI_FUNCTION_URL is not set, isAvailable is false and generateSummary()
 * falls through to the deterministic fallback automatically.
 */

import { AISummaryProvider, AISummaryResult, AISummaryPrompt } from './provider';
import { ReportType } from './reportTypes';

interface CloudFunctionRequest {
  system: string;
  user: string;
  reportType: ReportType;
}

interface CloudFunctionResponse {
  text: string;
  error?: string;
}

async function callCloudFunction(
  prompt: AISummaryPrompt,
  reportType: ReportType,
): Promise<AISummaryResult> {
  const url = (import.meta as any).env?.VITE_AI_FUNCTION_URL as string | undefined;
  if (!url) throw new Error('VITE_AI_FUNCTION_URL not configured');

  const body: CloudFunctionRequest = {
    system: prompt.system,
    user: prompt.user,
    reportType,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud Function error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as CloudFunctionResponse;

  if (data.error) throw new Error(data.error);
  if (!data.text) throw new Error('Empty response from Cloud Function');

  // Post-process: clean up ** markers
  // - Remove trailing ** from lines (we only want ** at the START of body paragraphs)
  // - Remove **word** markdown bold on header-like lines (Student:, School:, etc.)
  const cleaned = data.text
    .replace(/ ?\*\*\s*$/gm, '')                    // strip trailing **
    .replace(/^\*\*([A-Za-z /]+):\*\*/gm, '$1:')    // **Header:** → Header:
    .replace(/^\*\*([A-Za-z /]+):$/gm, '$1:');       // **Header: → Header:

  return {
    text: cleaned,
    source: 'ai',
    providerName: 'claude-sonnet-4-6',
  };
}

export function makeClaudeProvider(reportType: ReportType): AISummaryProvider {
  const url = (import.meta as any).env?.VITE_AI_FUNCTION_URL as string | undefined;
  return {
    name: 'claude-cloud-function',
    isAvailable: Boolean(url),
    async generate(prompt: AISummaryPrompt): Promise<AISummaryResult> {
      return callCloudFunction(prompt, reportType);
    },
  };
}
