import { BadRequestException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { LLM_DEFAULT_MODELS } from '@pmhybrid/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import {
  LLM_SETTINGS_READY_EVENT,
  LlmSettingsService,
} from './llm-settings.service.js';

const SECRET = 'a-long-enough-jwt-secret-for-the-tests-0123456789';
const KEY = 'sk-ant-api03-TEST-KEY-should-never-be-shown';

interface Row {
  id: string;
  provider: string;
  model: string;
  enabled: boolean;
  apiKeyEncrypted: string | null;
  temperature: number | null;
  timeoutMs: number;
  maxTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

function setup(secret = SECRET) {
  let row: Row | null = null;
  let jwtSecret = secret;
  const prisma = {
    llmSettings: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Partial<Row>;
          update: Partial<Row>;
        }) => {
          row = row
            ? { ...row, ...update, updatedAt: new Date() }
            : ({
                ...create,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as Row);
          return row;
        },
      ),
      update: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        row = { ...(row as Row), ...data, updatedAt: new Date() };
        return row;
      }),
    },
  };
  const record = vi.fn(async (_entry: unknown) => ({}));
  const emit = vi.fn((_event: string) => true);
  const service = new LlmSettingsService(
    prisma as unknown as PrismaService,
    { record } as unknown as AuditService,
    { get: () => jwtSecret } as never,
    { emit } as unknown as EventEmitter2,
  );
  return {
    service,
    record,
    emit,
    stored: () => row,
    rotateSecret: (next: string) => {
      jwtSecret = next;
    },
  };
}

describe('LlmSettingsService (Roadmap GAP-39a)', () => {
  it('starts not configured, with a default model and no key', async () => {
    const { service } = setup();

    expect(await service.getView()).toMatchObject({
      provider: 'ANTHROPIC',
      model: LLM_DEFAULT_MODELS.ANTHROPIC,
      enabled: false,
      hasApiKey: false,
      status: 'NOT_CONFIGURED',
      temperature: null,
      updatedAt: null,
    });
  });

  it('stores the key as ciphertext and never puts it in a view', async () => {
    const { service, stored } = setup();

    const view = await service.update({ apiKey: KEY }, 'actor-1');

    expect(view).toMatchObject({ hasApiKey: true, status: 'DISABLED' });
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect(JSON.stringify(await service.getView())).not.toContain(KEY);
    expect(stored()?.apiKeyEncrypted).toBeTruthy();
    expect(stored()?.apiKeyEncrypted).not.toContain(KEY);
  });

  it('refuses to enable without a usable key', async () => {
    const { service } = setup();

    await expect(
      service.update({ enabled: true }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is ready once enabled with a key, and hands the server the key in clear', async () => {
    const { service } = setup();

    const view = await service.update(
      {
        apiKey: KEY,
        enabled: true,
        model: 'claude-test',
        timeoutMs: 5000,
        temperature: 0.2,
      },
      'actor-1',
    );

    expect(view.status).toBe('READY');
    expect(await service.getRuntimeConfig()).toEqual({
      provider: 'ANTHROPIC',
      model: 'claude-test',
      apiKey: KEY,
      temperature: 0.2,
      timeoutMs: 5000,
      maxTokens: 1024,
    });
  });

  it('gives no runtime configuration while disabled or unconfigured', async () => {
    const { service } = setup();
    expect(await service.getRuntimeConfig()).toBeNull();

    await service.update({ apiKey: KEY }, 'actor-1');
    expect(await service.getRuntimeConfig()).toBeNull();
  });

  it("moves to the new provider's default model when the provider changes alone", async () => {
    const { service } = setup();
    await service.update({ apiKey: KEY, model: 'claude-custom' }, 'actor-1');

    const view = await service.update({ provider: 'OPENAI' }, 'actor-1');

    expect(view).toMatchObject({
      provider: 'OPENAI',
      model: LLM_DEFAULT_MODELS.OPENAI,
    });
    expect(
      (await service.update({ provider: 'OPENAI', model: 'gpt-x' }, 'a')).model,
    ).toBe('gpt-x');
  });

  it('keeps the temperature when absent and clears it when null', async () => {
    const { service } = setup();
    await service.update({ temperature: 0.7 }, 'actor-1');
    expect((await service.update({ model: 'm1' }, 'actor-1')).temperature).toBe(
      0.7,
    );

    expect(
      (await service.update({ temperature: null }, 'actor-1')).temperature,
    ).toBeNull();
  });

  it('audits what changed, flags a new key without ever recording it, and skips a no-op', async () => {
    const { service, record } = setup();

    await service.update({ apiKey: KEY, model: 'claude-test' }, 'actor-1');

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(entry).toMatchObject({
      actorId: 'actor-1',
      entityType: 'LlmSettings',
      operation: 'UPDATE',
      origin: 'UI',
    });
    expect(entry.newValue).toMatchObject({
      model: 'claude-test',
      apiKeyChanged: true,
    });
    expect(JSON.stringify(entry)).not.toContain(KEY);

    record.mockClear();
    await service.update({ model: 'claude-test' }, 'actor-1');
    expect(record).not.toHaveBeenCalled();
  });

  describe('telling the title normalizer the configuration is ready (Roadmap BUG-13)', () => {
    it('signals it once a save leaves the configuration ready, so what waited is worked on', async () => {
      const { service, emit } = setup();

      await service.update({ apiKey: KEY, enabled: true }, 'actor-1');

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(LLM_SETTINGS_READY_EVENT);
    });

    it('signals again when a ready configuration changes, for a corrected key or model', async () => {
      const { service, emit } = setup();
      await service.update({ apiKey: KEY, enabled: true }, 'actor-1');
      emit.mockClear();

      await service.update({ model: 'another-model' }, 'actor-1');
      expect(emit).toHaveBeenCalledTimes(1);

      emit.mockClear();
      await service.update({ apiKey: `${KEY}-replacement` }, 'actor-1');
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('does not signal for a save that changes nothing', async () => {
      const { service, emit } = setup();
      await service.update(
        { apiKey: KEY, enabled: true, model: 'm' },
        'actor-1',
      );
      emit.mockClear();

      await service.update({ model: 'm', enabled: true }, 'actor-1');

      expect(emit).not.toHaveBeenCalled();
    });

    it('does not signal while the configuration is not ready, nor when the key is removed', async () => {
      const { service, emit } = setup();

      await service.update({ apiKey: KEY }, 'actor-1'); // stored, switched off
      await service.update({ model: 'm' }, 'actor-1');
      await service.update({ enabled: true }, 'actor-1'); // now ready: this one signals
      emit.mockClear();
      await service.removeApiKey('actor-1');

      expect(emit).not.toHaveBeenCalled();
    });

    it('is not ready for a provider that has no model of its own yet: the default is used', async () => {
      const { service } = setup();

      const view = await service.update({ provider: 'OPENROUTER' }, 'actor-1');

      expect(view).toMatchObject({
        provider: 'OPENROUTER',
        model: LLM_DEFAULT_MODELS.OPENROUTER,
      });
      expect(LLM_DEFAULT_MODELS.OPENROUTER).toBe('anthropic/claude-haiku-4.5');
    });
  });

  it('removes the key, which switches the integration off, and is idempotent', async () => {
    const { service, record, stored } = setup();
    await service.update({ apiKey: KEY, enabled: true }, 'actor-1');
    record.mockClear();

    const view = await service.removeApiKey('actor-1');

    expect(view).toMatchObject({
      hasApiKey: false,
      enabled: false,
      status: 'NOT_CONFIGURED',
    });
    expect(stored()?.apiKeyEncrypted).toBeNull();
    expect(record).toHaveBeenCalledTimes(1);

    await service.removeApiKey('actor-1');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('reports an unreadable key (JWT_SECRET changed) and lets a new one fix it', async () => {
    const { service, rotateSecret } = setup();
    await service.update({ apiKey: KEY, enabled: true }, 'actor-1');

    rotateSecret(`${SECRET}-rotated`);

    expect((await service.getView()).status).toBe('KEY_UNREADABLE');
    expect(await service.getRuntimeConfig()).toBeNull();
    await expect(
      service.update({ enabled: true }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const view = await service.update(
      { apiKey: KEY, enabled: true },
      'actor-1',
    );
    expect(view.status).toBe('READY');
  });
});
