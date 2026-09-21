import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import {
  createScratchDocsPath,
  uniqueDocsPath,
} from './helpers/scratch-docs.js';

/**
 * Onboarding a project on an empty or missing folder failed: the first sync
 * and the first task hit a Roadmap.md that was not there (Roadmap GAP-36a).
 */
describe('Onboarding a project on an empty folder (e2e, Roadmap GAP-36a)', () => {
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
  const create = (docsPath: string) =>
    request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Onboarding E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      });

  it('creates the folder and the two documents for a path that does not exist yet, and reports them', async () => {
    const docsPath = path.join(uniqueDocsPath('onboarding'), 'docs');
    expect(existsSync(docsPath)).toBe(false);

    const res = await create(docsPath).expect(201);

    expect(res.body.scaffolded.sort()).toEqual(['Agentslog.md', 'Roadmap.md']);
    expect(existsSync(path.join(docsPath, 'Roadmap.md'))).toBe(true);
    expect(existsSync(path.join(docsPath, 'Agentslog.md'))).toBe(true);
  });

  it('gives the new project a first sync that succeeds with nothing in it, and a first task that is written into the Roadmap', async () => {
    const docsPath = path.join(uniqueDocsPath('onboarding-flow'), 'docs');
    const project = (await create(docsPath).expect(201)).body;

    const run = await request(server())
      .post(`/projects/${project.id}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(run.body.status).toBe('SUCCESS');
    expect(run.body.summary).toMatchObject({
      tasksCreated: 0,
      entryErrors: [],
      conflictsRaised: 0,
    });

    const task = await request(server())
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'The very first task', acceptanceCriteria: 'It exists' })
      .expect(201);
    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    const line = roadmap
      .split('\n')
      .find((candidate) => candidate.startsWith(`| ${task.body.externalId} |`));
    expect(line).toContain('| The very first task | It exists | TODO |');
    // In Active work, not after it.
    expect(roadmap.indexOf(task.body.externalId)).toBeLessThan(
      roadmap.indexOf('## Near term'),
    );

    // What the app wrote reads back with nothing to reconcile.
    const again = await request(server())
      .post(`/projects/${project.id}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(again.body.summary).toMatchObject({
      entryErrors: [],
      conflictsRaised: 0,
    });
  });

  it('never touches a document that is already there, and only fills in the one that is missing', async () => {
    const docsPath = createScratchDocsPath();
    const roadmapFile = path.join(docsPath, 'Roadmap.md');
    writeFileSync(roadmapFile, '# My own Roadmap\n', 'utf-8');
    rmSync(path.join(docsPath, 'Agentslog.md'));

    const res = await create(docsPath).expect(201);

    expect(res.body.scaffolded).toEqual(['Agentslog.md']);
    expect(readFileSync(roadmapFile, 'utf-8')).toBe('# My own Roadmap\n');
    expect(existsSync(path.join(docsPath, 'Agentslog.md'))).toBe(true);

    // With both there, nothing is created.
    const again = await create(docsPath).expect(201);
    expect(again.body.scaffolded).toEqual([]);
  });

  it('still refuses a folder outside the allowed roots, and creates nothing there', async () => {
    await create('/definitely/not/allowed/docs').expect(400);
    expect(existsSync('/definitely/not/allowed')).toBe(false);
  });
});
