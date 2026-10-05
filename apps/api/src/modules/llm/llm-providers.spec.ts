import { describe, expect, it, vi } from 'vitest';
import { LlmClient } from './llm-client.service.js';
import {
  LlmProviderError,
  type FetchLike,
  type LlmRuntimeConfig,
} from './llm.types.js';

const KEY = 'sk-ant-api03-SECRET-KEY-must-not-leak-0123456789';

const config = (
  overrides: Partial<LlmRuntimeConfig> = {},
): LlmRuntimeConfig => ({
  provider: 'ANTHROPIC',
  model: 'claude-test',
  apiKey: KEY,
  temperature: null,
  timeoutMs: 2000,
  maxTokens: 512,
  ...overrides,
});

const request = {
  system: 'Be brief.',
  messages: [{ role: 'user' as const, content: 'Hello' }],
};

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });

function client(fetchImpl: ReturnType<typeof vi.fn>) {
  return new LlmClient(fetchImpl as unknown as FetchLike);
}

async function failure(promise: Promise<unknown>): Promise<LlmProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LlmProviderError);
    return error as LlmProviderError;
  }
  throw new Error('expected the call to fail');
}

describe('LLM providers over fetch (Roadmap GAP-39c)', () => {
  describe('Anthropic', () => {
    it('sends the Messages API request and returns the text blocks', async () => {
      const fetchImpl = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          reply({
            content: [
              { type: 'text', text: 'Hola ' },
              { type: 'text', text: 'mundo' },
            ],
          }),
      );

      const text = await client(fetchImpl).complete(
        config({ temperature: 0.3 }),
        request,
      );

      expect(text).toBe('Hola mundo');
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        model: 'claude-test',
        max_tokens: 512,
        system: 'Be brief.',
        messages: request.messages,
        temperature: 0.3,
      });
    });

    it('sends no temperature when none is configured', async () => {
      const fetchImpl = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          reply({ content: [{ type: 'text', text: 'ok' }] }),
      );

      await client(fetchImpl).complete(config(), request);

      expect(
        JSON.parse(fetchImpl.mock.calls[0][1]?.body as string),
      ).not.toHaveProperty('temperature');
    });

    it('treats an answer with no text as a failure', async () => {
      const fetchImpl = vi.fn(async () =>
        reply({ content: [{ type: 'tool_use' }] }),
      );

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.kind).toBe('PROVIDER');
    });
  });

  describe('OpenAI', () => {
    it('sends the Chat Completions request and returns the message', async () => {
      const fetchImpl = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          reply({ choices: [{ message: { content: '{"a":1}' } }] }),
      );

      const text = await client(fetchImpl).complete(
        config({
          provider: 'OPENAI',
          model: 'gpt-test',
          apiKey: 'sk-openai-0123456789',
        }),
        request,
      );

      expect(text).toBe('{"a":1}');
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-openai-0123456789',
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        model: 'gpt-test',
        max_completion_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Be brief.' },
          ...request.messages,
        ],
      });
    });

    it('treats an empty message as a failure', async () => {
      const fetchImpl = vi.fn(async () =>
        reply({ choices: [{ message: { content: '  ' } }] }),
      );

      const error = await failure(
        client(fetchImpl).complete(config({ provider: 'OPENAI' }), request),
      );

      expect(error.kind).toBe('PROVIDER');
    });
  });

  describe('failures', () => {
    it.each([
      [401, 'AUTH'],
      [403, 'AUTH'],
      [429, 'RATE_LIMIT'],
      [504, 'TIMEOUT'],
      [400, 'PROVIDER'],
      [404, 'PROVIDER'],
      [500, 'PROVIDER'],
    ])('maps an HTTP %i to %s', async (status, kind) => {
      const fetchImpl = vi.fn(async () =>
        reply({ error: { message: 'nope' } }, status),
      );

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.kind).toBe(kind);
      expect(error.message).toContain(`Anthropic answered ${status}`);
      expect(error.message).toContain('nope');
    });

    it('never lets the API key into an error, even when the provider echoes it', async () => {
      const fetchImpl = vi.fn(async () =>
        reply(
          {
            error: {
              message: `Invalid key ${KEY} and also sk-other-ABCDEFGHIJKL`,
            },
          },
          401,
        ),
      );

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.message).not.toContain(KEY);
      expect(error.message).not.toContain('SECRET-KEY');
      expect(error.message).not.toContain('sk-other');
      expect(error.message).toContain('[redacted]');
      expect(error.stack ?? '').not.toContain(KEY);
    });

    it('cuts a very long provider message', async () => {
      const fetchImpl = vi.fn(async () =>
        reply({ error: { message: 'x'.repeat(5000) } }, 500),
      );

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.message.length).toBeLessThan(400);
    });

    it('reports a body that is not JSON', async () => {
      const fetchImpl = vi.fn(async () => reply('<html>gateway</html>', 200));

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.kind).toBe('PROVIDER');
      expect(error.message).toMatch(/not JSON/);
    });

    it('reports a network failure without the underlying error text', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error(`getaddrinfo ENOTFOUND with header x-api-key: ${KEY}`);
      });

      const error = await failure(
        client(fetchImpl).complete(config(), request),
      );

      expect(error.kind).toBe('NETWORK');
      expect(error.message).not.toContain(KEY);
    });

    it('gives up after the configured timeout', async () => {
      const fetchImpl = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      );

      const error = await failure(
        client(fetchImpl).complete(config({ timeoutMs: 30 }), request),
      );

      expect(error.kind).toBe('TIMEOUT');
    });

    it('has no adapter for an unknown provider', async () => {
      const fetchImpl = vi.fn();

      const error = await failure(
        Promise.resolve().then(() =>
          client(fetchImpl).complete(
            config({ provider: 'NOPE' as never }),
            request,
          ),
        ),
      );

      expect(error.kind).toBe('PROVIDER');
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('connection test', () => {
    it('is ok when the provider answers, with a small token budget', async () => {
      const fetchImpl = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          reply({ content: [{ type: 'text', text: 'OK' }] }),
      );

      const result = await client(fetchImpl).testConnection(
        config({ maxTokens: 4096 }),
      );

      expect(result).toEqual({ ok: true });
      expect(
        JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).max_tokens,
      ).toBe(32);
    });

    it('says what went wrong without throwing and without the key', async () => {
      const fetchImpl = vi.fn(async () =>
        reply({ error: { message: `bad key ${KEY}` } }, 401),
      );

      const result = await client(fetchImpl).testConnection(config());

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Anthropic answered 401');
      expect(JSON.stringify(result)).not.toContain(KEY);
    });
  });
});
