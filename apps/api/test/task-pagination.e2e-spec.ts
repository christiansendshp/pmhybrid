import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * The task list returned everything, 89 KB for 95 tasks (Roadmap
 * IMPROVEMENT-01d3). It is read a page at a time now, and the body is still the
 * array it was.
 */
describe('Task list pages (e2e, Roadmap IMPROVEMENT-01d3)', () => {
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

  async function projectWithTasks(count: number) {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Pages E2E ${Date.now()}-${Math.random()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const task = await request(server())
        .post(`/projects/${project.body.id}/tasks`)
        .set('Authorization', auth())
        .send({ title: `Task ${index}`, acceptanceCriteria: 'Verified' })
        .expect(201);
      ids.push(task.body.id);
    }
    return { projectId: project.body.id as string, ids };
  }

  const list = (projectId: string, query = '') =>
    request(server())
      .get(`/projects/${projectId}/tasks${query}`)
      .set('Authorization', auth());

  it('returns every task as an array, with no next page, when nothing is asked', async () => {
    const { projectId, ids } = await projectWithTasks(5);

    const res = await list(projectId).expect(200);

    expect(res.body.map((task: { id: string }) => task.id)).toEqual(ids);
    expect(res.headers['x-next-cursor']).toBeUndefined();
  });

  it('reads a page at a time, in creation order, following the cursor without a gap or a repeat', async () => {
    const { projectId, ids } = await projectWithTasks(5);

    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    do {
      const res = await list(
        projectId,
        `?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      ).expect(200);
      sizes.push(res.body.length);
      seen.push(...res.body.map((task: { id: string }) => task.id));
      cursor = res.headers['x-next-cursor'];
    } while (cursor);

    expect(seen).toEqual(ids);
    expect(sizes).toEqual([2, 2, 1]);
  });

  it('says nothing more on a page that ends the list exactly', async () => {
    const { projectId } = await projectWithTasks(4);
    const first = await list(projectId, '?limit=2').expect(200);

    const second = await list(
      projectId,
      `?limit=2&cursor=${first.headers['x-next-cursor']}`,
    ).expect(200);

    expect(second.body).toHaveLength(2);
    expect(second.headers['x-next-cursor']).toBeUndefined();
  });

  it('keeps the filters across the pages, and the cards keep what a card shows', async () => {
    const { projectId } = await projectWithTasks(3);

    const res = await list(projectId, '?limit=1&status=PENDIENTE').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      status: 'PENDIENTE',
      subtaskCounts: { total: 0, done: 0 },
      dependencyCounts: { total: 0, open: 0 },
    });
    expect(typeof res.body[0].computedProgress).toBe('number');
    expect(res.headers['x-next-cursor']).toBeDefined();
    const none = await list(projectId, '?limit=1&status=QA').expect(200);
    expect(none.body).toEqual([]);
    expect(none.headers['x-next-cursor']).toBeUndefined();
  });

  it.each([
    ['a limit of zero', '?limit=0'],
    ['a limit over the maximum', '?limit=501'],
    ['a limit that is not a number', '?limit=many'],
    ['a fractional limit', '?limit=1.5'],
    ['a cursor the list did not give', '?cursor=not-a-cursor'],
  ])('answers %s with a 400', async (_label, query) => {
    const { projectId } = await projectWithTasks(1);

    await list(projectId, query).expect(400);
  });
});
