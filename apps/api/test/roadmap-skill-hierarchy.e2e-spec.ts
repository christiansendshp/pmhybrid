import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { SKILL_ROADMAP } from './../src/modules/roadmap/skill-format.fixtures.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * The latest skill keeps its hierarchy in the headings of its Plan section, and
 * PM Hub read the rows but not the headings, so such a project had no phases
 * or epics (Roadmap GAP-38).
 */
describe('Hierarchy of the latest skill tables (e2e, Roadmap GAP-38)', () => {
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

  async function project() {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(file, SKILL_ROADMAP, 'utf-8');
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Skill hierarchy E2E ${Date.now()}-${Math.random()}`,
        docsPath,
      })
      .expect(201);
    return { projectId: res.body.id as string, file };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  async function taskOf(projectId: string, externalId: string) {
    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return list.body.find(
      (task: { externalId: string }) => task.externalId === externalId,
    ) as { id: string; epicId: string | null; phaseId: string | null };
  }

  async function listOf(projectId: string, kind: 'phases' | 'epics') {
    const res = await request(server())
      .get(`/projects/${projectId}/${kind}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as {
      id: string;
      externalId: string;
      name: string;
      phaseId?: string | null;
    }[];
  }

  it('makes a phase of a phase heading and an epic of an epic heading, and places the tables under them', async () => {
    const { projectId } = await project();

    const run = await sync(projectId);

    const phases = await listOf(projectId, 'phases');
    const epics = await listOf(projectId, 'epics');
    expect(phases).toMatchObject([
      { externalId: 'F01', name: 'Import and export' },
    ]);
    expect(epics).toMatchObject([
      { externalId: 'F01-E01', name: 'CSV support', phaseId: phases[0].id },
    ]);
    expect(run.body.summary).toMatchObject({
      structureSynced: 2,
      // The two Plan rows, and the two Gaps rows that name the phase.
      placementsChanged: 4,
      conflictsRaised: 0,
    });
    expect(await taskOf(projectId, 'F01-E01-T05')).toMatchObject({
      epicId: epics[0].id,
      phaseId: phases[0].id,
    });
    expect(await taskOf(projectId, 'F01-BUG-01')).toMatchObject({
      epicId: null,
      phaseId: phases[0].id,
    });
    // Its id looks like an epic's task, but it is in Active work, under no heading.
    expect(await taskOf(projectId, 'F01-E01-T01')).toMatchObject({
      epicId: null,
      phaseId: null,
    });
  });

  it('shows the phase in the progress tree, and a second run changes nothing', async () => {
    const { projectId } = await project();
    await sync(projectId);

    const progress = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);
    expect(progress.body.phases).toHaveLength(1);
    expect(progress.body.phases[0].name).toBe('Import and export');
    expect(progress.body.phases[0].epics[0].name).toBe('CSV support');

    const again = await sync(projectId);
    expect(again.body.summary).toMatchObject({
      structureSynced: 0,
      placementsChanged: 0,
    });
  });

  it('follows a heading that is renamed, and a table moved under another heading', async () => {
    const { projectId, file } = await project();
    await sync(projectId);

    writeFileSync(
      file,
      readFileSync(file, 'utf-8')
        .replace('### F01 — Import and export', '### F01 — Import, export')
        .replace(
          '#### F01-E01 — CSV support\n',
          '#### F01-E01 — CSV support\n\n#### F01-E02 — Other formats\n\n| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |\n|---|---|---|---|---|---|---|\n| F01-E02-T01 | Read JSON | json reads | TODO | — | — | — |\n',
        ),
      'utf-8',
    );
    await sync(projectId);

    expect((await listOf(projectId, 'phases'))[0].name).toBe('Import, export');
    const epics = await listOf(projectId, 'epics');
    expect(epics.map((epic) => epic.externalId)).toEqual([
      'F01-E01',
      'F01-E02',
    ]);
    expect(await taskOf(projectId, 'F01-E02-T01')).toMatchObject({
      epicId: epics[1].id,
    });
  });

  it('writes nothing for a move made in PM Hub, which a table has no place for', async () => {
    const { projectId, file } = await project();
    await sync(projectId);
    const task = await taskOf(projectId, 'F01-E01-T01');
    const epic = (await listOf(projectId, 'epics'))[0];
    const before = readFileSync(file, 'utf-8');

    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ epicId: epic.id })
      .expect(200);

    expect(readFileSync(file, 'utf-8')).toBe(before);
    const audit = await request(server())
      .get(`/projects/${projectId}/audit?entityType=Task`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      audit.body.filter(
        (event: { operation: string }) =>
          event.operation === 'WRITE_BACK_DEFERRED',
      ),
    ).toEqual([]);
    // A task in Active work is under no heading, so nothing undoes the move.
    await sync(projectId);
    expect((await taskOf(projectId, 'F01-E01-T01')).epicId).toBe(epic.id);
  });
});
