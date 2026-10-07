import { LlmProviderError, type FetchLike } from './llm.types.js';

const MAX_ERROR_LENGTH = 300;

/**
 * A text from (or about) a provider, safe to keep: every occurrence of the API
 * key is removed, anything shaped like one is removed too (a provider can
 * echo a differently-masked copy), and it is cut short. Nothing a provider
 * says is stored or shown without passing through here.
 */
export function sanitizeProviderText(text: string, secrets: string[]): string {
  let clean = text;
  for (const secret of secrets) {
    if (secret) {
      clean = clean.split(secret).join('[redacted]');
    }
  }
  clean = clean
    .replace(/\b(?:sk|key|pk|rk)[-_][A-Za-z0-9_-]{8,}/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > MAX_ERROR_LENGTH
    ? `${clean.slice(0, MAX_ERROR_LENGTH)}…`
    : clean;
}

interface PostJsonOptions {
  fetchImpl: FetchLike;
  /** What the provider is called in a message ("Anthropic"). */
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  /** Strings that must never appear in an error: the API key. */
  secrets: string[];
}

/**
 * POSTs JSON and returns the parsed answer, or throws an `LlmProviderError`
 * whose message carries no secret and no request detail. The timeout covers the
 * whole exchange, the body included.
 */
export async function postJson(options: PostJsonOptions): Promise<unknown> {
  const { fetchImpl, provider, url, headers, body, timeoutMs, secrets } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      if (controller.signal.aborted) {
        throw new LlmProviderError(
          'TIMEOUT',
          `${provider} did not answer within ${Math.round(timeoutMs / 1000)} seconds`,
        );
      }
      throw new LlmProviderError('NETWORK', `${provider} could not be reached`);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    if (!response.ok) {
      throw new LlmProviderError(
        statusToKind(response.status),
        `${provider} answered ${response.status}${describe(json, secrets)}`,
      );
    }
    if (json === undefined) {
      throw new LlmProviderError(
        'PROVIDER',
        `${provider} answered with something that is not JSON`,
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function statusToKind(status: number) {
  if (status === 401 || status === 403) {
    return 'AUTH' as const;
  }
  // 402 is OpenRouter's "not enough credits": like a rate limit it is about the
  // account, not the request, so the rest of a queue would be refused the same way.
  if (status === 429 || status === 402) {
    return 'RATE_LIMIT' as const;
  }
  if (status === 408 || status === 504) {
    return 'TIMEOUT' as const;
  }
  return 'PROVIDER' as const;
}

/** `: <the provider's own message>` from the usual `{ error: { message } }` shape, or nothing. */
function describe(json: unknown, secrets: string[]): string {
  const message = (json as { error?: { message?: unknown } } | undefined)?.error
    ?.message;
  return typeof message === 'string' && message.trim()
    ? `: ${sanitizeProviderText(message, secrets)}`
    : '';
}
