/**
 * The LLM the instance is configured to use (Roadmap GAP-39). Kept here so the
 * API that validates it and the web page that edits it name the same
 * providers, defaults and limits.
 */
export const LLM_PROVIDERS = ['ANTHROPIC', 'OPENAI'] as const;
export type LlmProviderKey = (typeof LLM_PROVIDERS)[number];

/** A sensible, cheap model for the short structured task the app gives the LLM; the administrator can name any other. */
export const LLM_DEFAULT_MODELS: Record<LlmProviderKey, string> = {
  ANTHROPIC: 'claude-haiku-4-5-20251001',
  OPENAI: 'gpt-4o-mini',
};

export const LLM_LIMITS = {
  TIMEOUT_MS: { min: 1_000, max: 120_000, default: 30_000 },
  MAX_TOKENS: { min: 64, max: 8_192, default: 1_024 },
  /** Both providers accept this range; leaving it unset sends nothing and the provider's own default applies. */
  TEMPERATURE: { min: 0, max: 1 },
  MODEL_MAX_LENGTH: 100,
  API_KEY: { min: 8, max: 512 },
} as const;

/**
 * Where the configuration stands:
 * - `NOT_CONFIGURED`: no API key stored.
 * - `DISABLED`: a key is stored but the administrator has switched it off.
 * - `KEY_UNREADABLE`: the stored key cannot be decrypted (the secret it is
 *   derived from changed); entering the key again fixes it.
 * - `READY`: enabled with a readable key; the only state in which the app
 *   calls the LLM.
 */
export type LlmSettingsStatus = 'NOT_CONFIGURED' | 'DISABLED' | 'KEY_UNREADABLE' | 'READY';

/**
 * What the API returns for the configuration. It never carries the key: only
 * `hasApiKey` says whether one is stored.
 */
export interface LlmSettingsView {
  provider: LlmProviderKey;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  status: LlmSettingsStatus;
  /** null: not sent, the provider's default applies. */
  temperature: number | null;
  timeoutMs: number;
  maxTokens: number;
  updatedAt: string | null;
}

/** The outcome of the connection test; `error` is already free of the key. */
export interface LlmConnectionTestResult {
  ok: boolean;
  error?: string;
}
