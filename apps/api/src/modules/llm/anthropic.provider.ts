import { postJson } from './http-json.util.js';
import {
  LlmProviderError,
  type FetchLike,
  type LlmProvider,
  type LlmRequest,
  type LlmRuntimeConfig,
} from './llm.types.js';

const URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Anthropic's Messages API over the global `fetch` — no SDK, as `GitHubGitProvider` does (Roadmap GAP-39c). */
export class AnthropicProvider implements LlmProvider {
  constructor(private readonly fetchImpl: FetchLike) {}

  async complete(
    config: LlmRuntimeConfig,
    request: LlmRequest,
  ): Promise<string> {
    const answer = (await postJson({
      fetchImpl: this.fetchImpl,
      provider: 'Anthropic',
      url: URL,
      headers: { 'x-api-key': config.apiKey, 'anthropic-version': API_VERSION },
      body: {
        model: config.model,
        max_tokens: config.maxTokens,
        system: request.system,
        messages: request.messages,
        ...(config.temperature === null
          ? {}
          : { temperature: config.temperature }),
      },
      timeoutMs: config.timeoutMs,
      secrets: [config.apiKey],
    })) as { content?: { type?: string; text?: unknown }[] };

    const text = (answer.content ?? [])
      .filter(
        (block) => block.type === 'text' && typeof block.text === 'string',
      )
      .map((block) => block.text as string)
      .join('');
    if (!text.trim()) {
      throw new LlmProviderError(
        'PROVIDER',
        'Anthropic answered with no text',
        true,
      );
    }
    return text;
  }
}
