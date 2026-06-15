/**
 * AI Summary provider abstraction — Phase AI.1
 *
 * Defines the AISummaryProvider interface so future AI providers (Claude, OpenAI)
 * can be swapped in without changing call sites.
 *
 * AI.1 ships noneProvider only — always falls back to deterministic.
 * AI.2 will add claudeProvider behind a Cloud Function proxy.
 *
 * Provider selection: read VITE_AI_PROVIDER env var (or a future Firestore config doc).
 * All call sites go through generateSummary() in index.ts — never import a provider directly.
 */

export interface AISummaryResult {
  text: string;
  source: 'ai' | 'deterministic';
  tokensUsed?: number;
  providerName: string;
}

export interface AISummaryPrompt {
  system: string;
  user: string;
}

export interface AISummaryProvider {
  name: string;
  isAvailable: boolean;
  generate(prompt: AISummaryPrompt): Promise<AISummaryResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// noneProvider — AI.1 default: always signals fallback needed
// ─────────────────────────────────────────────────────────────────────────────

export const noneProvider: AISummaryProvider = {
  name: 'none',
  isAvailable: false,
  async generate(_prompt) {
    throw new Error('No AI provider configured — use deterministic fallback.');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory — returns the configured provider (AI.2 will add more options)
// ─────────────────────────────────────────────────────────────────────────────

export function getAISummaryProvider(): AISummaryProvider {
  // AI.2: check VITE_AI_PROVIDER and return claudeProvider / openaiProvider
  // For now always return none so generateSummary() falls back to deterministic
  return noneProvider;
}
