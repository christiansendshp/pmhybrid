import { Inject, Injectable } from '@nestjs/common';
import type { LlmConnectionTestResult } from '@pmhybrid/shared-types';
import { AnthropicProvider } from './anthropic.provider.js';
import { sanitizeProviderText } from './http-json.util.js';
import {
  LLM_FETCH,
  LlmProviderError,
  type FetchLike,
  type LlmProvider,
  type LlmRequest,
  type LlmRuntimeConfig,
} from './llm.types.js';
import {
  OPENAI_OPTIONS,
  OPENROUTER_OPTIONS,
  OpenAiCompatibleProvider,
} from './openai-compatible.provider.js';

/**
 * The one door to a provider (Roadmap GAP-39c): picks the adapter the
 * configuration names. Adding a provider is an adapter and a line here.
 */
@Injectable()
export class LlmClient {
  private readonly providers: Record<string, LlmProvider>;

  constructor(@Inject(LLM_FETCH) fetchImpl: FetchLike) {
    this.providers = {
      ANTHROPIC: new AnthropicProvider(fetchImpl),
      OPENAI: new OpenAiCompatibleProvider(fetchImpl, OPENAI_OPTIONS),
      OPENROUTER: new OpenAiCompatibleProvider(fetchImpl, OPENROUTER_OPTIONS),
    };
  }

  complete(config: LlmRuntimeConfig, request: LlmRequest): Promise<string> {
    const provider = this.providers[config.provider];
    if (!provider) {
      throw new LlmProviderError(
        'PROVIDER',
        `There is no adapter for the provider ${config.provider}`,
      );
    }
    return provider.complete(config, request);
  }

  /** A minimal real call, so the administrator learns before relying on it whether the key, the model and the network work. Never throws: the result says. */
  async testConnection(
    config: LlmRuntimeConfig,
  ): Promise<LlmConnectionTestResult> {
    try {
      await this.complete(
        { ...config, maxTokens: Math.min(config.maxTokens, 32) },
        {
          system:
            'You are a connectivity check. Answer with the single word OK.',
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        },
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof LlmProviderError
            ? error.message
            : sanitizeProviderText('The call failed', [config.apiKey]),
      };
    }
  }
}
