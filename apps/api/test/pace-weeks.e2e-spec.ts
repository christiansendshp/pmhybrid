import { Test, TestingModule } from '@nestjs/testing';
import { weekStartOf } from './../src/modules/metrics/pace.util.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

/**
 * The weeks of the pace are the ones the appendix SQL of docs/tracking-improvement-plan.md draws with
 * `date_trunc('week', …)` on the UTC timestamps of `Task` (Roadmap TASK-35).
 */
describe('Pace weeks against date_trunc (e2e, Roadmap TASK-35)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    await moduleFixture.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await moduleFixture.close();
  });

  const truncatedByPostgres = async (moment: string): Promise<string> => {
    const rows = await prisma.$queryRaw<{ week: Date }[]>`
      select date_trunc('week', ${moment}::timestamp) as week`;
    return rows[0].week.toISOString();
  };

  it.each([
    '2026-10-25 23:59:59.999',
    '2026-10-26 00:00:00.000',
    '2026-10-28 15:30:00.000',
    '2026-11-01 23:59:59.999',
    '2026-11-02 00:00:00.000',
    '2026-01-01 10:00:00.000',
    '2024-02-29 12:00:00.000',
    '2026-12-31 23:59:59.999',
  ])('puts %s in the same week as Postgres does', async (moment) => {
    const week = weekStartOf(new Date(`${moment.replace(' ', 'T')}Z`));

    expect(week.toISOString()).toBe(await truncatedByPostgres(moment));
  });
});
