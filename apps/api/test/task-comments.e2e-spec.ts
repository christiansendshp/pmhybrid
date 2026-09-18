import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Roadmap GAP-31: TaskComment's REST surface — any authenticated project
 * member can read and write, no permission beyond membership.
 */
describe('Task comments (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let outsiderToken: string;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const server = app.getHttpServer();

    const login = await request(server)
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;

    const uniqueEmail = `outsider-${Date.now()}-${Math.random().toString(36).slice(2)}@pmhybrid.local`;
    await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ displayName: 'Outsider', email: uniqueEmail, password: 'outsider123' })
      .expect(201);
    const outsiderLogin = await request(server)
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'outsider123' })
      .expect(200);
    outsiderToken = outsiderLogin.body.accessToken;

    const project = await request(server)
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Comments E2E ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    projectId = project.body.id;

    const task = await request(server)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Needs a comment', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    taskId = task.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('starts with no comments, then lists one after it is added', async () => {
    const empty = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(empty.body).toEqual([]);

    const added = await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Looks good to me.' })
      .expect(201);
    expect(added.body.body).toBe('Looks good to me.');
    expect(added.body.author).toMatchObject({ kind: 'HUMAN' });

    const listed = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(added.body.id);
  });

  it('rejects a blank comment body', async () => {
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: '   ' })
      .expect(400);
  });

  it('denies a non-member from reading or writing comments (ProjectMemberGuard)', async () => {
    await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ body: 'Should not land.' })
      .expect(403);
  });

  it('404s for a task that does not exist in the project', async () => {
    await request(server())
      .get(`/projects/${projectId}/tasks/does-not-exist/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
