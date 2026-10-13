import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

interface LedgerEntry {
  at: string;
  task: string;
  word: string;
}

const ledger = (...entries: LedgerEntry[]) =>
  [
    '# Agents log',
    '',
    '## Entries',
    '',
    ...entries.flatMap((entry) => [
      `## [${entry.at}] | tester | ${entry.task} | ${entry.word}`,
      '',
      '- Summary: s',
      '- Files: f',
      '- Verify: v',
      '- Follow-up: n',
      '',
    ]),
  ].join('\n');

const roadmap = (...ids: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...ids.map((id) => `| ${id} | Work ${id} | check | IN PROGRESS | — | — |`),
    '',
    '## Near term',
    '',
    '| ID | Outcome | Acceptance check | Status | Depends on |',
    '| --- | --- | --- | --- | --- |',
    '| — | — | — | — | — |',
    '',
    '## Blocked',
    '',
    '| ID | Blocker | Needed decision or event | Owner |',
    '| --- | --- | --- | --- |',
    '| — | — | — | — |',
    '',
  ].join('\n');

/** Tasks closed within minutes of starting are flagged, from the ledger, and nothing else changes (Roadmap TASK-12). */
describe('Instant closes (e2e, Roadmap TASK-12)', () => {
  let app: INestApplication<App>;
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

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** A project whose ledger tells six stories; times are the agent's own. */
  async function projectWithLedger() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap('IC-1', 'IC-2', 'IC-3', 'IC-4', 'IC-5', 'IC-6'),
      'utf-8',
    );
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      ledger(
        // Closed two minutes after starting.
        { at: '2026-10-13T10:00:00Z', task: 'IC-1', word: 'IN_PROGRESS' },
        { at: '2026-10-13T10:02:00Z', task: 'IC-1', word: 'DONE' },
        // Worked for an hour and a half.
        { at: '2026-10-13T10:00:00Z', task: 'IC-2', word: 'IN_PROGRESS' },
        { at: '2026-10-13T11:30:00Z', task: 'IC-2', word: 'DONE' },
        // Started, not closed.
        { at: '2026-10-13T10:00:00Z', task: 'IC-3', word: 'IN_PROGRESS' },
        // A close dated before its start is not a span at all.
        { at: '2026-10-13T10:10:00Z', task: 'IC-4', word: 'IN_PROGRESS' },
        { at: '2026-10-13T10:00:00Z', task: 'IC-4', word: 'DONE' },
        // One second under the limit.
        { at: '2026-10-13T10:00:00Z', task: 'IC-5', word: 'IN_PROGRESS' },
        { at: '2026-10-13T10:04:59Z', task: 'IC-5', word: 'DONE' },
        // Started again later and closed minutes after the second start: the first start counts.
        { at: '2026-10-13T10:00:00Z', task: 'IC-6', word: 'IN_PROGRESS' },
        { at: '2026-10-13T12:00:00Z', task: 'IC-6', word: 'IN_PROGRESS' },
        { at: '2026-10-13T12:03:00Z', task: 'IC-6', word: 'DONE' },
      ),
      'utf-8',
    );
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Instant close E2E'), docsPath })
      .expect(201);
    const projectId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    return projectId;
  }

  const metrics = async (projectId: string) =>
    (
      await request(server())
        .get(`/projects/${projectId}/metrics`)
        .set('Authorization', auth())
        .expect(200)
    ).body.instantClose;

  const flags = async (projectId: string) => {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return Object.fromEntries(
      (res.body as { externalId: string; instantClose: boolean }[]).map(
        (task) => [task.externalId, task.instantClose],
      ),
    );
  };

  it('counts the tasks the ledger shows closed and the ones closed under five minutes, with the share', async () => {
    const projectId = await projectWithLedger();

    expect(await metrics(projectId)).toEqual({
      thresholdMinutes: 5,
      closedTasks: 4,
      instantCloses: 2,
      share: 0.5,
    });
  });

  it('flags those tasks on the board and on the task page, and no other', async () => {
    const projectId = await projectWithLedger();

    expect(await flags(projectId)).toEqual({
      'IC-1': true,
      'IC-2': false,
      'IC-3': false,
      'IC-4': false,
      'IC-5': true,
      'IC-6': false,
    });
    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const id = (name: string) =>
      (list.body as { id: string; externalId: string }[]).find(
        (task) => task.externalId === name,
      )!.id;
    const instant = await request(server())
      .get(`/projects/${projectId}/tasks/${id('IC-1')}`)
      .set('Authorization', auth())
      .expect(200);
    const slow = await request(server())
      .get(`/projects/${projectId}/tasks/${id('IC-2')}`)
      .set('Authorization', auth())
      .expect(200);
    expect(instant.body.instantClose).toBe(true);
    expect(slow.body.instantClose).toBe(false);
  });

  it('is a signal only: it changes no task and blocks no move of the one it flags', async () => {
    const projectId = await projectWithLedger();
    const cards = async () =>
      (
        (
          await request(server())
            .get(`/projects/${projectId}/tasks`)
            .set('Authorization', auth())
            .expect(200)
        ).body as Record<string, unknown>[]
      ).map(({ instantClose: _flag, ...card }) => card);
    const before = await cards();

    await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send({ instantCloseMinutes: 1440 })
      .expect(200);

    expect(await cards()).toEqual(before);
    const flagged = before.find((card) => card.externalId === 'IC-1')!;
    await request(server())
      .post(`/projects/${projectId}/tasks/${flagged.id as string}/transition`)
      .set('Authorization', auth())
      .send({ status: 'QA' })
      .expect(201);
  });

  it('hands out the first start and the last close of every task the ledger shows, as the agent wrote them (Roadmap TASK-23)', async () => {
    const projectId = await projectWithLedger();

    const res = await request(server())
      .get(`/projects/${projectId}/metrics/spans`)
      .set('Authorization', auth())
      .expect(200);

    expect(res.body.spans).toEqual({
      'IC-1': {
        startedAt: '2026-10-13T10:00:00.000Z',
        doneAt: '2026-10-13T10:02:00.000Z',
      },
      'IC-2': {
        startedAt: '2026-10-13T10:00:00.000Z',
        doneAt: '2026-10-13T11:30:00.000Z',
      },
      // Not closed.
      'IC-3': { startedAt: '2026-10-13T10:00:00.000Z', doneAt: null },
      // A close dated before its start is handed out as written: the view decides what to draw.
      'IC-4': {
        startedAt: '2026-10-13T10:10:00.000Z',
        doneAt: '2026-10-13T10:00:00.000Z',
      },
      'IC-5': {
        startedAt: '2026-10-13T10:00:00.000Z',
        doneAt: '2026-10-13T10:04:59.000Z',
      },
      // The first start counts, the last close.
      'IC-6': {
        startedAt: '2026-10-13T10:00:00.000Z',
        doneAt: '2026-10-13T12:03:00.000Z',
      },
    });
  });

  it('hands out nothing for a project whose ledger is empty', async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('No spans'), docsPath: createScratchDocsPath() })
      .expect(201);

    const res = await request(server())
      .get(`/projects/${created.body.id}/metrics/spans`)
      .set('Authorization', auth())
      .expect(200);

    expect(res.body).toEqual({ spans: {} });
  });

  describe('the threshold, a project setting', () => {
    it('is five minutes for a new project, can be changed by the people who edit the project, and recomputes the figures', async () => {
      const projectId = await projectWithLedger();
      const project = await request(server())
        .get(`/projects/${projectId}`)
        .set('Authorization', auth())
        .expect(200);
      expect(project.body.instantCloseMinutes).toBe(5);

      const updated = await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ instantCloseMinutes: 120 })
        .expect(200);

      expect(updated.body.instantCloseMinutes).toBe(120);
      expect(await metrics(projectId)).toEqual({
        thresholdMinutes: 120,
        closedTasks: 4,
        // IC-2 (90 minutes) joins the two that were already under it; IC-6 (123) does not.
        instantCloses: 3,
        share: 0.75,
      });
      expect((await flags(projectId))['IC-2']).toBe(true);
      expect((await flags(projectId))['IC-6']).toBe(false);
    });

    it.each([0, -3, 1441, 2.5, 'five', null])('refuses %j', async (value) => {
      const projectId = await projectWithLedger();

      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ instantCloseMinutes: value })
        .expect(400);
    });

    it('accepts the limits, one minute and a day', async () => {
      const projectId = await projectWithLedger();

      for (const minutes of [1, 1440]) {
        const res = await request(server())
          .patch(`/projects/${projectId}`)
          .set('Authorization', auth())
          .send({ instantCloseMinutes: minutes })
          .expect(200);
        expect(res.body.instantCloseMinutes).toBe(minutes);
      }
    });
  });

  it('is for the members of the project only', async () => {
    const projectId = await projectWithLedger();
    const email = `${unique('outsider')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: unique('Outsider'), email, password: 'password123' })
      .expect(201);
    const outsider = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(server()).get(`/projects/${projectId}/metrics`).expect(401);
    await request(server())
      .get(`/projects/${projectId}/metrics`)
      .set('Authorization', auth(outsider.body.accessToken))
      .expect(403);
    await request(server())
      .get(`/projects/${projectId}/metrics/spans`)
      .expect(401);
    await request(server())
      .get(`/projects/${projectId}/metrics/spans`)
      .set('Authorization', auth(outsider.body.accessToken))
      .expect(403);
  });

  it('has no figure for a project whose ledger shows nothing closed', async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Empty ledger'), docsPath: createScratchDocsPath() })
      .expect(201);

    expect(await metrics(created.body.id)).toEqual({
      thresholdMinutes: 5,
      closedTasks: 0,
      instantCloses: 0,
      share: null,
    });
  });
});
