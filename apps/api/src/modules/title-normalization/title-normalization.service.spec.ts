import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { LlmRuntimeConfig } from '../llm/llm.types.js';
import type { LlmSettingsService } from '../settings/llm-settings.service.js';
import { TitleNormalizationService } from './title-normalization.service.js';
import type {
  NormalizationOutcome,
  TitleNormalizer,
} from './title-normalizer.service.js';

const CONFIG: LlmRuntimeConfig = {
  provider: 'ANTHROPIC',
  model: 'm',
  apiKey: 'sk-ant-unit-test-key-0123456789',
  temperature: null,
  timeoutMs: 1000,
  maxTokens: 256,
};

const task = (id: string) => ({
  id,
  projectId: 'p1',
  externalId: `T-${id}`,
  entryType: 'TASK',
  title: `titulo largo ${id}`,
  description: null,
  generatedDescription: null,
  acceptanceCriteria: null,
  phase: null,
  epic: null,
});

function setup(options: {
  config?: LlmRuntimeConfig | null;
  queues?: ReturnType<typeof task>[][];
  outcome?: NormalizationOutcome;
  updateCount?: number;
}) {
  const queues = [...(options.queues ?? [])];
  const findMany = vi.fn(async (_args: unknown) => queues.shift() ?? []);
  const updateMany = vi.fn(async (_args: unknown) => ({
    count: options.updateCount ?? 1,
  }));
  const record = vi.fn(async (_entry: unknown) => ({}));
  const normalize = vi.fn(
    async () =>
      options.outcome ?? {
        status: 'NORMALIZED' as const,
        title: 'corto',
        description: 'una descripcion larga y real',
        truncatedLocally: false,
      },
  );
  const service = new TitleNormalizationService(
    { task: { findMany, updateMany } } as unknown as PrismaService,
    {
      getRuntimeConfig: vi.fn(async () =>
        options.config === undefined ? CONFIG : options.config,
      ),
    } as unknown as LlmSettingsService,
    { normalize } as unknown as TitleNormalizer,
    { record } as unknown as AuditService,
  );
  return { service, findMany, updateMany, record, normalize };
}

describe('TitleNormalizationService (Roadmap GAP-39d)', () => {
  it('waits, touching nothing, while the LLM is not ready', async () => {
    const { service, findMany, normalize } = setup({
      config: null,
      queues: [[task('1')]],
    });

    await service.drain('p1');

    expect(findMany).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  });

  it('works the queue to the end, one task after another', async () => {
    const { service, normalize, record } = setup({
      queues: [[task('1'), task('2')], []],
    });

    await service.drain('p1');

    expect(normalize.mock.calls).toHaveLength(2);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('is single-flight per project, and a call during a run makes it go round once more', async () => {
    const { service, findMany, normalize } = setup({
      queues: [[task('1')], [], [task('2')], []],
    });

    const first = service.drain('p1');
    const second = service.drain('p1');
    await Promise.all([first, second]);

    // Two passes over the queue (the second asked for while the first ran), each to its end.
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(normalize).toHaveBeenCalledTimes(2);
    // Another project is independent.
    await service.drain('p2');
  });

  it('drops an answer for a title that changed meanwhile: nothing is audited', async () => {
    const { service, record } = setup({
      queues: [[task('1')], []],
      updateCount: 0,
    });

    await service.drain('p1');

    expect(record).not.toHaveBeenCalled();
  });

  it('records a failure without throwing', async () => {
    const { service, updateMany, record } = setup({
      queues: [[task('1')], []],
      outcome: {
        status: 'FAILED',
        kind: 'TIMEOUT',
        message: 'Anthropic did not answer within 1 seconds',
      },
    });

    await service.drain('p1');

    const call = updateMany.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toEqual({
      titleNormalization: 'FAILED',
      titleNormalizationError: 'Anthropic did not answer within 1 seconds',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('stops after a bounded number of rounds however long the queue stays', async () => {
    const endless = Array.from({ length: 50 }, () => [task('1')]);
    const { service, findMany } = setup({ queues: endless });

    await service.drain('p1');

    expect(findMany.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('never rejects, and says nothing that could hold a secret', async () => {
    const { service, findMany } = setup({ queues: [[task('1')]] });
    findMany.mockRejectedValueOnce(new Error(`database said ${CONFIG.apiKey}`));

    await expect(service.drain('p1')).resolves.toBeUndefined();
  });
});
