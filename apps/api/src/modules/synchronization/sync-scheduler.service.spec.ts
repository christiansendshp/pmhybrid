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
    syncRun: { findMany: ReturnType<typeof vi.fn> };
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
        // Newest first, like the real query.
        findMany: vi.fn(({ where }: { where: { projectId: string } }) =>
          Promise.resolve(
            {
              due: [{ startedAt: minutesAgo(6), status: 'SUCCESS' }],
              recent: [{ startedAt: minutesAgo(1), status: 'SUCCESS' }],
            }[where.projectId] ?? [],
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

  describe('backoff after failed syncs (Roadmap BUG-05)', () => {
    function historyOf(...statuses: string[]) {
      // One run per interval, newest first: [5 min ago, 10 min ago, ...] for a 5-minute interval.
      return statuses.map((status, index) => ({
        status,
        startedAt: minutesAgo(5 * (index + 1) + 0.5),
      }));
    }

    async function syncedProjects(history: ReturnType<typeof historyOf>) {
      prisma.project.findMany.mockResolvedValue([
        { id: 'failing', syncIntervalMinutes: 5 },
      ]);
      prisma.syncRun.findMany.mockResolvedValue(history);
      await scheduler(true).tick();
      return runSync.mock.calls.length;
    }

    it('retries a project after one failure only once twice the interval has passed', async () => {
      // Last run failed 5.5 min ago: an interval has passed, twice the interval has not.
      expect(await syncedProjects(historyOf('FAILED'))).toBe(0);
    });

    it('retries after the doubled wait', async () => {
      const history = [{ status: 'FAILED', startedAt: minutesAgo(10.5) }];
      expect(await syncedProjects(history)).toBe(1);
    });

    it('keeps doubling with each consecutive failure', async () => {
      // Three failures in a row: the wait is 5 x 8 = 40 minutes.
      const recent = [
        { status: 'FAILED', startedAt: minutesAgo(30) },
        { status: 'FAILED', startedAt: minutesAgo(50) },
        { status: 'FAILED', startedAt: minutesAgo(60) },
      ];
      expect(await syncedProjects(recent)).toBe(0);
      runSync.mockClear();
      const older = [
        { status: 'FAILED', startedAt: minutesAgo(41) },
        { status: 'FAILED', startedAt: minutesAgo(50) },
        { status: 'FAILED', startedAt: minutesAgo(60) },
      ];
      expect(await syncedProjects(older)).toBe(1);
    });

    it('caps the wait at 16 times the interval', async () => {
      // A long streak of failures, the latest 81 minutes ago (> 16 x 5 = 80).
      const streak = Array.from({ length: 5 }, (_, index) => ({
        status: 'FAILED',
        startedAt: minutesAgo(81 + index * 5),
      }));
      expect(await syncedProjects(streak)).toBe(1);
    });

    it('does not back off once a run has succeeded since', async () => {
      // Newest run succeeded (an older one failed): the plain interval applies.
      const history = [
        { status: 'SUCCESS', startedAt: minutesAgo(5.5) },
        { status: 'FAILED', startedAt: minutesAgo(11) },
      ];
      expect(await syncedProjects(history)).toBe(1);
    });
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
