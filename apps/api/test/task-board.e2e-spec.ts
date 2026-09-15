import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

describe('Task board cards (brief §15 — e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

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
    token = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;

  it('lists each card with its assignee, rolled-up progress, subtask and open dependency counts', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Board E2E ${Date.now()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = project.body.id as string;
    const me = await request(server())
      .get('/auth/me')
      .set('Authorization', auth())
      .expect(200);

    const createTask = async (body: object) =>
      (
        await request(server())
          .post(`/projects/${projectId}/tasks`)
          .set('Authorization', auth())
          .send({ acceptanceCriteria: 'Reviewed', ...body })
          .expect(201)
      ).body as { id: string };
    const post = (path: string, body: object) =>
      request(server())
        .post(`/projects/${projectId}/tasks/${path}`)
        .set('Authorization', auth())
        .send(body);

    const card = await createTask({
      title: 'Card',
      priority: 'HIGH',
      dueDate: '2026-10-10',
    });
    await createTask({
      title: 'Half done',
      parentTaskId: card.id,
      progressPercent: 50,
    });
    const finished = await createTask({
      title: 'Finished',
      parentTaskId: card.id,
    });
    const prerequisite = await createTask({ title: 'Prerequisite' });

    // Walk one subtask to TERMINADA, so it is both a done subtask and a closed dependency.
    await post(`${finished.id}/assign`, { actorId: me.body.id }).expect(201);
    for (const status of ['EN_DESARROLLO', 'QA', 'TERMINADA']) {
      await post(`${finished.id}/transition`, { status }).expect(201);
    }
    await post(`${card.id}/dependencies`, {
      dependsOnTaskId: prerequisite.id,
    }).expect(201);
    await post(`${card.id}/dependencies`, {
      dependsOnTaskId: finished.id,
    }).expect(201);
    await post(`${card.id}/assign`, { actorId: me.body.id }).expect(201);

    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const listed = list.body.find(
      (task: { id: string }) => task.id === card.id,
    );

    expect(listed).toMatchObject({
      title: 'Card',
      priority: 'HIGH',
      status: 'ASIGNADA',
      dueDate: '2026-10-10T00:00:00.000Z',
      assignee: { id: me.body.id, kind: 'HUMAN' },
      subtaskCounts: { total: 2, done: 1 },
      dependencyCounts: { total: 2, open: 1 },
      // Rolled up from its subtasks: 50 and TERMINADA's 100.
      computedProgress: 75,
    });
  });
});
