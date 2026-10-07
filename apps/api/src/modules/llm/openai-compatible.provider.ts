import { postJson } from './http-json.util.js';
import {
  LlmProviderError,
  type FetchLike,
  type LlmProvider,
  type LlmRequest,
  type LlmRuntimeConfig,
} from './llm.types.js';

/** What tells one OpenAI-style chat-completions service from another. */
export interface OpenAiCompatibleOptions {
  /** What the service is called in a message ("OpenRouter"). */
  name: string;
  url: string;
  /** The name of the output limit: `max_completion_tokens` for OpenAI (`max_tokens` is refused by its newer models), `max_tokens` for OpenRouter. */
  limitParameter: 'max_completion_tokens' | 'max_tokens';
  /** Sent with every call, besides the authorization. */
  headers?: Record<string, string>;
}

/**
 * A chat-completions API of the OpenAI dialect over the global `fetch` (Roadmap
 * GAP-39c, BUG-13): OpenAI itself and OpenRouter, which fronts many models at its
 * own URL. `json_object` makes the model answer with a JSON object (the prompt
 * says "JSON", which that mode requires); the answer is validated all the same.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly options: OpenAiCompatibleOptions,
  ) {}

  async complete(
    config: LlmRuntimeConfig,
    request: LlmRequest,
  ): Promise<string> {
    const { name, url, limitParameter, headers } = this.options;
    const answer = (await postJson({
      fetchImpl: this.fetchImpl,
      provider: name,
      url,
      headers: { authorization: `Bearer ${config.apiKey}`, ...headers },
      body: {
        model: config.model,
        [limitParameter]: config.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          ...request.messages,
        ],
        ...(config.temperature === null
          ? {}
          : { temperature: config.temperature }),
      },
      timeoutMs: config.timeoutMs,
      secrets: [config.apiKey],
    })) as { choices?: { message?: { content?: unknown } }[] };

    const text = answer.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new LlmProviderError(
        'PROVIDER',
        `${name} answered with no text`,
        true,
      );
    }
    return text;
  }
}

export const OPENAI_OPTIONS: OpenAiCompatibleOptions = {
  name: 'OpenAI',
  url: 'https://api.openai.com/v1/chat/completions',
  limitParameter: 'max_completion_tokens',
};

export const OPENROUTER_OPTIONS: OpenAiCompatibleOptions = {
  name: 'OpenRouter',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  limitParameter: 'max_tokens',
  // OpenRouter's optional attribution: the name an application shows in its dashboard.
  headers: { 'x-title': 'PM Hub' },
};
