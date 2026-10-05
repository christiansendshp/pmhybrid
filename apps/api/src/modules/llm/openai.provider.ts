import { postJson } from './http-json.util.js';
import {
  LlmProviderError,
  type FetchLike,
  type LlmProvider,
  type LlmRequest,
  type LlmRuntimeConfig,
} from './llm.types.js';

const URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI's Chat Completions API over the global `fetch` (Roadmap GAP-39c).
 * `json_object` makes the model answer with a JSON object (the prompt says
 * "JSON", which that mode requires); the answer is validated all the same.
 */
export class OpenAiProvider implements LlmProvider {
  constructor(private readonly fetchImpl: FetchLike) {}

  async complete(
    config: LlmRuntimeConfig,
    request: LlmRequest,
  ): Promise<string> {
    const answer = (await postJson({
      fetchImpl: this.fetchImpl,
      provider: 'OpenAI',
      url: URL,
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: {
        model: config.model,
        // The current name of the limit; `max_tokens` is refused by newer models.
        max_completion_tokens: config.maxTokens,
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
      throw new LlmProviderError('PROVIDER', 'OpenAI answered with no text');
    }
    return text;
  }
}
