import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { LlmRuntimeConfig } from '../llm/llm.types.js';
import type { LlmSettingsService } from '../settings/llm-settings.service.js';
import {
  NORMALIZATION_CONCURRENCY,
  TitleNormalizationService,
} from './title-normalization.service.js';
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
      titleNormalizationAttempts: { increment: 1 },
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

describe('working every project once the configuration is ready (Roadmap BUG-13)', () => {
  const LONG = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce';

  interface Row {
    id: string;
    projectId: string;
    title: string;
    state: 'PENDING' | 'FAILED' | null;
    /** Failures in a row; absent is none. */
    attempts?: number;
  }

  /** A database of two projects, enough of Prisma to queue and work them. */
  function world(
    rows: Row[],
    config: LlmRuntimeConfig | null = CONFIG,
    outcomeFor: (
      title: string,
    ) => NormalizationOutcome | Promise<NormalizationOutcome> = () => ({
      status: 'SKIPPED',
    }),
  ) {
    const normalized: string[] = [];
    const prisma = {
      project: {
        findMany: vi.fn(async () => [{ id: 'p1' }, { id: 'p2' }]),
      },
      task: {
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              projectId?: string;
              id?: string | { in: string[] };
              titleNormalization?: string | null;
              titleNormalizationAttempts?: { lt: number };
            };
            data: {
              titleNormalization?: 'PENDING' | 'FAILED' | null;
              titleNormalizationAttempts?: number | { increment: number };
            };
          }) => {
            let count = 0;
            for (const row of rows) {
              const byProject =
                where.projectId === undefined ||
                where.projectId === row.projectId;
              const byId =
                where.id === undefined ||
                (typeof where.id === 'string'
                  ? where.id === row.id
                  : where.id.in.includes(row.id));
              const byState =
                where.titleNormalization === undefined ||
                where.titleNormalization === row.state;
              const byAttempts =
                where.titleNormalizationAttempts === undefined ||
                (row.attempts ?? 0) < where.titleNormalizationAttempts.lt;
              if (
                byProject &&
                byId &&
                byState &&
                byAttempts &&
                'titleNormalization' in data
              ) {
                row.state = data.titleNormalization ?? null;
                const attempts = data.titleNormalizationAttempts;
                if (attempts !== undefined) {
                  row.attempts =
                    typeof attempts === 'number'
                      ? attempts
                      : (row.attempts ?? 0) + attempts.increment;
                }
                count += 1;
              }
            }
            return { count };
          },
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: { projectId: string; titleNormalization: string | null };
          }) =>
            rows
              .filter(
                (row) =>
                  row.projectId === where.projectId &&
                  row.state === where.titleNormalization,
              )
              .map((row) => ({
                ...task(row.id),
                projectId: row.projectId,
                title: row.title,
              })),
        ),
      },
    };
    const normalize = vi.fn(
      async (_config: LlmRuntimeConfig, source: { title: string }) => {
        normalized.push(source.title);
        return outcomeFor(source.title);
      },
    );
    const service = new TitleNormalizationService(
      prisma as unknown as PrismaService,
      {
        getRuntimeConfig: vi.fn(async () => config),
      } as unknown as LlmSettingsService,
      { normalize } as unknown as TitleNormalizer,
      { record: vi.fn() } as unknown as AuditService,
    );
    return { service, rows, normalized, prisma };
  }

  it('queues the failed ones and the long titles never queued, in every project, and works them', async () => {
    const rows: Row[] = [
      { id: 'a', projectId: 'p1', title: LONG, state: null },
      { id: 'b', projectId: 'p1', title: 'corto', state: null },
      { id: 'c', projectId: 'p2', title: LONG, state: 'FAILED' },
      { id: 'd', projectId: 'p2', title: `${LONG} otra`, state: 'PENDING' },
    ];
    const { service, normalized } = world(rows);

    await service.queueEveryProject();

    expect(normalized.sort()).toEqual([LONG, LONG, `${LONG} otra`].sort());
    // A short title is never queued, and nothing is left waiting.
    expect(rows.find((row) => row.id === 'b')?.state).toBeNull();
    expect(
      rows.filter((row) => row.state === 'PENDING' || row.state === 'FAILED'),
    ).toEqual([]);
  });

  it('is what the ready signal does, and returns at once', () => {
    const { service } = world([]);
    const queueEveryProject = vi
      .spyOn(service, 'queueEveryProject')
      .mockResolvedValue(undefined);

    expect(service.onSettingsReady()).toBeUndefined();

    expect(queueEveryProject).toHaveBeenCalledTimes(1);
  });

  it('goes round once more when a second signal arrives during a run, and never runs two at once', async () => {
    const rows: Row[] = [
      { id: 'a', projectId: 'p1', title: LONG, state: null },
    ];
    const { service, prisma } = world(rows);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    prisma.project.findMany.mockImplementationOnce(async () => {
      await gate;
      return [{ id: 'p1' }];
    });

    const first = service.queueEveryProject();
    const second = service.queueEveryProject();
    expect(second).toBe(first);
    release();
    await first;

    expect(prisma.project.findMany).toHaveBeenCalledTimes(2);
  });

  it('only queues, and calls no one, while the configuration is not ready', async () => {
    const rows: Row[] = [
      { id: 'a', projectId: 'p1', title: LONG, state: null },
    ];
    const { service, normalized } = world(rows, null);

    await service.queueEveryProject();

    expect(normalized).toEqual([]);
    expect(rows[0].state).toBe('PENDING');
  });

  it('goes one project after another, never all at once', async () => {
    const rows: Row[] = [
      { id: 'a', projectId: 'p1', title: LONG, state: null },
      { id: 'b', projectId: 'p2', title: `${LONG} dos`, state: null },
    ];
    const { service, normalized } = world(rows);

    await service.queueEveryProject();

    expect(normalized).toEqual([LONG, `${LONG} dos`]);
  });

  describe('a provider that refuses the key or the quota', () => {
    const refused =
      (kind: 'AUTH' | 'RATE_LIMIT' | 'PROVIDER') =>
      (): NormalizationOutcome => ({
        status: 'FAILED',
        kind,
        message: 'The provider refused',
      });
    const three = (projectId: string): Row[] =>
      ['uno', 'dos', 'tres'].map((word, index) => ({
        id: `${projectId}-${index}`,
        projectId,
        title: `${LONG} ${word}`,
        state: 'PENDING' as const,
      }));

    it.each(['AUTH', 'RATE_LIMIT'] as const)(
      'stops a pass at the first %s failure and leaves the rest of the queue waiting, not failed',
      async (kind) => {
        const rows = three('p1');
        const { service, normalized } = world(rows, CONFIG, refused(kind));

        await service.drain('p1');

        expect(normalized).toHaveLength(1);
        expect(rows.map((row) => row.state)).toEqual([
          'FAILED',
          'PENDING',
          'PENDING',
        ]);
      },
    );

    it('goes on after a failure that is about the task, not about the key or the quota', async () => {
      const rows = three('p1');
      const { service, normalized } = world(rows, CONFIG, refused('PROVIDER'));

      await service.drain('p1');

      expect(normalized).toHaveLength(3);
      expect(rows.map((row) => row.state)).toEqual([
        'FAILED',
        'FAILED',
        'FAILED',
      ]);
    });

    it('costs one call per project, not one per task, when the key is refused everywhere', async () => {
      const rows = [...three('p1'), ...three('p2')];
      const { service, normalized } = world(rows, CONFIG, refused('AUTH'));

      await service.queueEveryProject();

      expect(normalized).toHaveLength(2);
      expect(rows.filter((row) => row.state === 'PENDING')).toHaveLength(4);
    });
  });

  describe('after a sync (Roadmap BUG-14)', () => {
    const failing = (): NormalizationOutcome => ({
      status: 'FAILED',
      kind: 'PROVIDER',
      message: 'The provider answered 500',
    });

    it('tries the failed ones again with the ones the sync queued, and works them', async () => {
      const rows: Row[] = [
        { id: 'a', projectId: 'p1', title: LONG, state: 'FAILED', attempts: 1 },
        {
          id: 'b',
          projectId: 'p1',
          title: `${LONG} dos`,
          state: 'PENDING',
        },
        { id: 'c', projectId: 'p2', title: `${LONG} tres`, state: 'FAILED' },
      ];
      const { service, normalized } = world(rows);

      await service.afterSync('p1');

      // The project that synced is worked; another project's failed one is not its business.
      expect(normalized.sort()).toEqual([LONG, `${LONG} dos`].sort());
      expect(rows.find((row) => row.id === 'c')?.state).toBe('FAILED');
    });

    it('leaves a task alone once it has failed too many times in a row', async () => {
      const rows: Row[] = [
        { id: 'a', projectId: 'p1', title: LONG, state: 'FAILED', attempts: 3 },
        {
          id: 'b',
          projectId: 'p1',
          title: `${LONG} dos`,
          state: 'FAILED',
          attempts: 2,
        },
      ];
      const { service, normalized } = world(rows);

      await service.afterSync('p1');

      expect(normalized).toEqual([`${LONG} dos`]);
      expect(rows.find((row) => row.id === 'a')).toMatchObject({
        state: 'FAILED',
        attempts: 3,
      });
    });

    it('counts each failure, so a task that always fails stops being paid for after three syncs', async () => {
      const rows: Row[] = [
        { id: 'a', projectId: 'p1', title: LONG, state: 'PENDING' },
      ];
      const { service, normalized } = world(rows, CONFIG, failing);

      await service.afterSync('p1');
      await service.afterSync('p1');
      await service.afterSync('p1');
      await service.afterSync('p1');
      await service.afterSync('p1');

      expect(normalized).toHaveLength(3);
      expect(rows[0]).toMatchObject({ state: 'FAILED', attempts: 3 });
    });

    it('starts the count again when a person asks, or the configuration is saved', async () => {
      const rows: Row[] = [
        { id: 'a', projectId: 'p1', title: LONG, state: 'FAILED', attempts: 3 },
      ];
      const { service, normalized } = world(rows);

      const result = await service.queueProject('p1');
      await service.drain('p1');

      expect(result).toMatchObject({ retried: 1, processing: true });
      expect(normalized).toEqual([LONG]);
      expect(rows[0].attempts).toBe(0);
    });

    it('only works what is queued, and leaves the failed ones as they are, while the LLM is not ready', async () => {
      const rows: Row[] = [
        { id: 'a', projectId: 'p1', title: LONG, state: 'FAILED', attempts: 1 },
      ];
      const { service, normalized } = world(rows, null);

      await service.afterSync('p1');

      expect(normalized).toEqual([]);
      expect(rows[0]).toMatchObject({ state: 'FAILED', attempts: 1 });
    });

    it('never rejects when the database fails', async () => {
      const { service, prisma } = world([]);
      prisma.task.updateMany.mockRejectedValueOnce(
        new Error('database said no'),
      );

      await expect(service.afterSync('p1')).resolves.toBeUndefined();
    });

    it('is what a finished sync does, and returns at once', () => {
      const { service } = world([]);
      const afterSync = vi
        .spyOn(service, 'afterSync')
        .mockResolvedValue(undefined);

      expect(service.onSyncCompleted({ projectId: 'p1' })).toBeUndefined();

      expect(afterSync).toHaveBeenCalledWith('p1');
    });
  });

  describe('a few calls at a time (Roadmap BUG-14)', () => {
    const many = (count: number): Row[] =>
      Array.from({ length: count }, (_, index) => ({
        id: `t${index}`,
        projectId: 'p1',
        title: `${LONG} ${index}`,
        state: 'PENDING' as const,
      }));

    function slow() {
      const tick = { running: 0, peak: 0, atFirstCall: -1, started: 0 };
      const outcomeFor = async (): Promise<NormalizationOutcome> => {
        tick.started += 1;
        tick.running += 1;
        if (tick.started === 1) {
          tick.atFirstCall = tick.running;
        }
        tick.peak = Math.max(tick.peak, tick.running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        tick.running -= 1;
        return { status: 'SKIPPED' };
      };
      return { tick, outcomeFor };
    }

    it('works the queue with a bounded concurrency, not one at a time and not all at once', async () => {
      const rows = many(12);
      const { tick, outcomeFor } = slow();
      const { service, normalized } = world(rows, CONFIG, outcomeFor);

      await service.drain('p1');

      expect(normalized).toHaveLength(12);
      expect(tick.peak).toBe(NORMALIZATION_CONCURRENCY);
    });

    it('sends the first call of a pass alone, so a wrong key costs one call', async () => {
      const rows = many(8);
      const { tick, outcomeFor } = slow();
      const { service } = world(rows, CONFIG, outcomeFor);

      await service.drain('p1');

      expect(tick.atFirstCall).toBe(1);
    });

    it('starts no more once one is refused, and leaves what was not started waiting', async () => {
      const rows = many(12);
      let started = 0;
      const { service } = world(rows, CONFIG, async () => {
        started += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          status: 'FAILED',
          kind: 'RATE_LIMIT',
          message: 'OpenRouter answered 429',
        };
      });

      await service.drain('p1');

      // Refused on the call that went alone: nothing else is started.
      expect(started).toBe(1);
      expect(rows.filter((row) => row.state === 'PENDING')).toHaveLength(11);
    });
  });

  it('never rejects when the database fails', async () => {
    const { service, prisma } = world([]);
    prisma.project.findMany.mockRejectedValueOnce(
      new Error('database said no'),
    );

    await expect(service.queueEveryProject()).resolves.toBeUndefined();
  });
});
