import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/** The advisory limits on the work in progress are settings of the project and never stop a move (Roadmap TASK-15). */
describe('Project WIP limits (e2e, Roadmap TASK-15)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: string;

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

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    ownerId = (
      await request(server())
        .get('/auth/me')
        .set('Authorization', auth())
        .expect(200)
    ).body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function project() {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('WIP E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  const patch = (projectId: string, body: Record<string, unknown>) =>
    request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send(body);

  it('has no limit in a new project, and the project says so', async () => {
    const projectId = await project();

    const res = await request(server())
      .get(`/projects/${projectId}`)
      .set('Authorization', auth())
      .expect(200);

    expect(res.body).toMatchObject({
      wipLimitDevelopment: null,
      wipLimitQa: null,
      wipLimitAgent: null,
    });
  });

  it('sets each limit apart, keeps the others, and clears one with null', async () => {
    const projectId = await project();

    await patch(projectId, { wipLimitDevelopment: 3 }).expect(200);
    const both = await patch(projectId, {
      wipLimitQa: 2,
      wipLimitAgent: 1,
    }).expect(200);
    expect(both.body).toMatchObject({
      wipLimitDevelopment: 3,
      wipLimitQa: 2,
      wipLimitAgent: 1,
    });

    const cleared = await patch(projectId, {
      wipLimitDevelopment: null,
    }).expect(200);
    expect(cleared.body).toMatchObject({
      wipLimitDevelopment: null,
      wipLimitQa: 2,
      wipLimitAgent: 1,
    });
    // A change of something else leaves them as they are.
    const renamed = await patch(projectId, {
      description: 'Only the text',
    }).expect(200);
    expect(renamed.body).toMatchObject({ wipLimitQa: 2, wipLimitAgent: 1 });
  });

  it('accepts the ends of the range, one and 999', async () => {
    const projectId = await project();

    const res = await patch(projectId, {
      wipLimitDevelopment: 1,
      wipLimitQa: 999,
    }).expect(200);

    expect(res.body).toMatchObject({ wipLimitDevelopment: 1, wipLimitQa: 999 });
  });

  it.each([0, -1, 1000, 2.5, 'three', true])(
    'refuses %j, naming the field',
    async (value) => {
      const projectId = await project();

      for (const field of [
        'wipLimitDevelopment',
        'wipLimitQa',
        'wipLimitAgent',
      ]) {
        const res = await patch(projectId, { [field]: value }).expect(400);
        expect(JSON.stringify(res.body.message)).toContain(field);
      }
    },
  );

  it('audits a change of a limit with what it was and what it is, and a repeat of it writes nothing', async () => {
    const projectId = await project();
    await patch(projectId, { wipLimitQa: 4 }).expect(200);
    const count = () =>
      prisma.auditEvent.count({
        where: { projectId, entityType: 'Project', operation: 'UPDATE' },
      });
    const before = await count();

    await patch(projectId, { wipLimitQa: 5 }).expect(200);
    const changed = await prisma.auditEvent.findFirstOrThrow({
      where: { projectId, entityType: 'Project', operation: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    });
    await patch(projectId, { wipLimitQa: 5 }).expect(200);

    expect(changed.previousValue).toEqual({ wipLimitQa: 4 });
    expect(changed.newValue).toEqual({ wipLimitQa: 5 });
    expect(await count()).toBe(before + 1);
  });

  it('never blocks a move into a column that is full: it only warns on the board', async () => {
    const projectId = await project();
    await patch(projectId, { wipLimitDevelopment: 1 }).expect(200);
    const move = async (title: string) => {
      const task = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title, acceptanceCriteria: 'Verified' })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
        .set('Authorization', auth())
        .send({ actorId: ownerId })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/tasks/${task.body.id}/transition`)
        .set('Authorization', auth())
        .send({ status: 'EN_DESARROLLO' })
        .expect(201);
    };

    await move('First in development');
    await move('Second, past the limit');

    const inDevelopment = await prisma.task.count({
      where: { projectId, status: 'EN_DESARROLLO' },
    });
    expect(inDevelopment).toBe(2);
  });

  it('is changed by someone who may edit the project only', async () => {
    const projectId = await project();
    const email = `${unique('viewer')}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: unique('Viewer'), email, password: 'password123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.body.id })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ wipLimitDevelopment: 1 })
      .expect(403);
  });
});
