import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const row = (id: string, status: string) =>
  `| ${id} | Work ${id} | Work to do on ${id}. | It works. | ${status} | — | — | — |`;

const roadmap = (...rows: [string, string][]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |',
    '|---|---|---|---|---|---|---|---|',
    ...(rows.length > 0
      ? rows.map(([id, status]) => row(id, status))
      : ['| — | — | — | — | — | — | — | — |']),
    '',
    '<!-- context:end -->',
    '',
    '## Near term',
    '',
    '| ID | Name | Acceptance check | Status | Depends on |',
    '|---|---|---|---|---|',
    '| — | — | — | TODO | — |',
    '',
  ].join('\n');

const LEDGER = `# Agents log

## Entries

## [2026-10-20T10:00:00Z] | tester | R-1 | IN_PROGRESS | Work R-1
- Summary: started
- Verify: pending
`;

/**
 * A task whose row left the Roadmap with nothing in the ledger to say why can be settled by writing its row
 * back, with the task's own data (Roadmap GAP-46).
 */
describe('Restoring the row of a vanished task (e2e, Roadmap GAP-46)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;

  const sync = async (projectId: string) =>
    (
      await request(server())
        .post(`/projects/${projectId}/sync`)
        .set('Authorization', auth())
        .expect(201)
    ).body as { summary: Record<string, number> };

  /** A task in development and one waiting, both synced, then both rows taken out of the Roadmap. */
  async function rowsGone() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap(['R-1', 'IN_PROGRESS'], ['R-2', 'TODO']),
      'utf-8',
    );
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Restore row E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    await sync(projectId);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmap(), 'utf-8');
    await sync(projectId);
    return { projectId, docsPath };
  }

  const conflictOf = async (projectId: string, externalId: string) => {
    const task = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId },
    });
    return {
      task,
      conflict: await prisma.conflict.findFirstOrThrow({
        where: { projectId, entityId: task.id, resolvedAt: null },
      }),
    };
  };

  const restore = (projectId: string, conflictId: string) =>
    request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'RESTORE_ROW' });

  const rowIn = (docsPath: string, id: string) =>
    readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')
      .split('\n')
      .find((line) => line.startsWith(`| ${id} |`))
      ?.split('|')
      .map((cell) => cell.trim())
      .slice(1, -1);

  it('writes the row back with the title, the acceptance check and the status of the task, and settles the conflict', async () => {
    const { projectId, docsPath } = await rowsGone();
    const { task, conflict } = await conflictOf(projectId, 'R-1');

    await restore(projectId, conflict.id).expect(201);

    expect(rowIn(docsPath, 'R-1')).toEqual([
      'R-1',
      'Work R-1',
      'Work R-1',
      'It works.',
      'IN_PROGRESS',
      '—',
      '—',
      '—',
    ]);
    const settled = await prisma.conflict.findUniqueOrThrow({
      where: { id: conflict.id },
    });
    expect(settled).toMatchObject({ resolutionStrategy: 'RESTORE_ROW' });
    expect(settled.resolvedAt).not.toBeNull();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status,
    ).toBe('EN_DESARROLLO');
  });

  it('writes a task that was waiting as a row that says TODO', async () => {
    const { projectId, docsPath } = await rowsGone();
    const { conflict } = await conflictOf(projectId, 'R-2');

    await restore(projectId, conflict.id).expect(201);

    expect(rowIn(docsPath, 'R-2')?.[4]).toBe('TODO');
  });

  it('adds nothing to the ledger, which already tells the task’s history', async () => {
    const { projectId, docsPath } = await rowsGone();
    const before = readFileSync(path.join(docsPath, 'Agentslog.md'), 'utf-8');
    const { conflict } = await conflictOf(projectId, 'R-1');

    await restore(projectId, conflict.id).expect(201);

    expect(readFileSync(path.join(docsPath, 'Agentslog.md'), 'utf-8')).toBe(
      before,
    );
  });

  it('is read back by the next sync as the same task, with no conflict raised and the row as its table', async () => {
    const { projectId } = await rowsGone();
    const { task, conflict } = await conflictOf(projectId, 'R-1');
    await restore(projectId, conflict.id).expect(201);

    const run = await sync(projectId);

    expect(run.summary.conflictsRaised).toBe(0);
    expect(
      await prisma.conflict.count({
        where: { projectId, entityId: task.id, resolvedAt: null },
      }),
    ).toBe(0);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .roadmapTable,
    ).toBe('ACTIVE');
  });

  it('records in the audit trail who restored the row, and from where', async () => {
    const { projectId } = await rowsGone();
    const { task, conflict } = await conflictOf(projectId, 'R-1');

    await restore(projectId, conflict.id).expect(201);

    const events = await prisma.auditEvent.findMany({
      where: {
        projectId,
        entityId: task.id,
        operation: { in: ['WRITE_BACK', 'CONFLICT_RESOLVED'] },
      },
      select: { operation: true, origin: true, newValue: true },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'WRITE_BACK',
          origin: 'UI',
          newValue: { trigger: 'RESTORED' },
        }),
        expect.objectContaining({
          operation: 'CONFLICT_RESOLVED',
          newValue: expect.objectContaining({ strategy: 'RESTORE_ROW' }),
        }),
      ]),
    );
  });

  it('refuses a conflict that is not about a vanished row', async () => {
    const docsPath = createScratchDocsPath();
    // a status the app does not know raises an UNRECOGNIZED_STATUS conflict
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap(['R-9', 'SOMETHING_WEIRD']),
      'utf-8',
    );
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Restore refuse E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    await sync(projectId);
    const { conflict } = await conflictOf(projectId, 'R-9');

    const res = await restore(projectId, conflict.id).expect(400);

    expect(res.body.message).toContain('RESTORE_ROW only applies');
  });
});
