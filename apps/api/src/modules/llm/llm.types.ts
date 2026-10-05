import type { LlmProviderKey } from '@pmhybrid/shared-types';

/**
 * What a call to the provider needs. It holds the API key in clear: it exists
 * only inside the server, between the settings that decrypt the key and the
 * provider call that sends it (Roadmap GAP-39).
 */
export interface LlmRuntimeConfig {
  provider: LlmProviderKey;
  model: string;
  apiKey: string;
  temperature: number | null;
  timeoutMs: number;
  maxTokens: number;
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** The standing instructions. */
  system: string;
  /** The conversation: it starts and ends with a `user` message. */
  messages: LlmMessage[];
}

/** One provider's adapter: turns a request into the text the model answered. */
export interface LlmProvider {
  complete(config: LlmRuntimeConfig, request: LlmRequest): Promise<string>;
}

export type LlmErrorKind =
  /** The provider rejected the key (401/403). */
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  /** Any other answer that is not a success, or a success with no text. */
  | 'PROVIDER';

/**
 * A failed call. The message is written for a person and is already free of
 * the API key (`sanitizeProviderText`): it is safe to log, store and show.
 */
export class LlmProviderError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

/** The `fetch` the adapters use; a token so a test can answer for the provider without the network. */
export const LLM_FETCH = Symbol('LLM_FETCH');
export type FetchLike = typeof fetch;
