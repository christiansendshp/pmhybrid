import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEnv, type EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SyncSchedulerService } from './sync-scheduler.service.js';
import { SynchronizationService } from './synchronization.service.js';

describe('SyncSchedulerService', () => {
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000);
  let prisma: {
    project: { findMany: ReturnType<typeof vi.fn> };
    syncRun: { findFirst: ReturnType<typeof vi.fn> };
  };
  let runSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'due', syncIntervalMinutes: 5 },
          { id: 'recent', syncIntervalMinutes: 5 },
          { id: 'never-synced', syncIntervalMinutes: 5 },
        ]),
      },
      syncRun: {
        findFirst: vi.fn(({ where }: { where: { projectId: string } }) =>
          Promise.resolve(
            {
              due: { startedAt: minutesAgo(6) },
              recent: { startedAt: minutesAgo(1) },
            }[where.projectId] ?? null,
          ),
        ),
      },
    };
    runSync = vi.fn().mockResolvedValue({});
  });

  function scheduler(enabled: boolean) {
    const config = { get: vi.fn().mockReturnValue(enabled) };
    return new SyncSchedulerService(
      prisma as unknown as PrismaService,
      { runSync } as unknown as SynchronizationService,
      config as unknown as ConfigService<EnvConfig, true>,
    );
  }

  it('syncs every active project whose interval has elapsed, and never-synced ones', async () => {
    await scheduler(true).tick();

    expect(runSync.mock.calls.map(([projectId]) => projectId)).toEqual([
      'due',
      'never-synced',
    ]);
    expect(runSync).toHaveBeenCalledWith('due', 'SCHEDULED');
  });

  it('keeps going after one project fails to sync', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    runSync.mockRejectedValueOnce(new Error('ENOENT'));

    await scheduler(true).tick();

    expect(runSync).toHaveBeenCalledTimes(2);
  });

  it('does nothing when SYNC_SCHEDULER_ENABLED is false', async () => {
    await scheduler(false).tick();

    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('reads the switch as on unless it is explicitly "false"', () => {
    const base = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'test-only' };

    expect(validateEnv(base).SYNC_SCHEDULER_ENABLED).toBe(true);
    expect(
      validateEnv({ ...base, SYNC_SCHEDULER_ENABLED: 'true' })
        .SYNC_SCHEDULER_ENABLED,
    ).toBe(true);
    expect(
      validateEnv({ ...base, SYNC_SCHEDULER_ENABLED: 'FALSE' })
        .SYNC_SCHEDULER_ENABLED,
    ).toBe(false);
  });
});
