import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Creating and editing a task, and declaring its dependencies, need
 * `task.write` (Roadmap SECURITY-02). Before, any project member could,
 * including one holding no role at all or the read-only VIEWER role.
 */
describe('task.write (e2e, Roadmap SECURITY-02)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
  const newTask = (title: string) => ({ title, acceptanceCriteria: 'Verified by e2e' });

  async function setup() {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Task write E2E ${Date.now()}-${Math.random()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id as string;
    const seed = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send(newTask('Seed task'))
      .expect(201);
    const other = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send(newTask('Other task'))
      .expect(201);
    return { projectId, taskId: seed.body.id as string, otherTaskId: other.body.id as string };
  }

  async function memberToken(projectId: string, roleName?: string) {
    const email = `writer-${Date.now()}-${Math.random().toString(36).slice(2)}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Writer', email, password: 'writer1234' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    if (roleName) {
      await assignProjectRole(server(), auth(), projectId, created.body.id, roleName);
    }
    const login = await request(server()).post('/auth/login').send({ email, password: 'writer1234' }).expect(200);
    return `Bearer ${login.body.accessToken}`;
  }

  it.each([
    ['no role at all', undefined],
    ['the read-only VIEWER role', 'VIEWER'],
  ])('a member with %s can read but not create, edit or add dependencies', async (_label, roleName) => {
    const { projectId, taskId, otherTaskId } = await setup();
    const token = await memberToken(projectId, roleName);

    await request(server()).get(`/projects/${projectId}/tasks`).set('Authorization', token).expect(200);
    await request(server()).get(`/projects/${projectId}/tasks/${taskId}`).set('Authorization', token).expect(200);

    const create = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', token)
      .send(newTask('Sneaked in'))
      .expect(403);
    expect(create.body.message).toContain('task.write');
    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', token)
      .send({ title: 'Renamed by a reader' })
      .expect(403);
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/dependencies`)
      .set('Authorization', token)
      .send({ dependsOnTaskId: otherTaskId })
      .expect(403);

    const unchanged = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(unchanged.body.title).toBe('Seed task');
  });

  it('a DEVELOPER can create, edit and add dependencies', async () => {
    const { projectId, taskId, otherTaskId } = await setup();
    const token = await memberToken(projectId, 'DEVELOPER');

    await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', token)
      .send(newTask('By a developer'))
      .expect(201);
    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', token)
      .send({ title: 'Renamed by a developer' })
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/dependencies`)
      .set('Authorization', token)
      .send({ dependsOnTaskId: otherTaskId })
      .expect(201);
  });

  it('commenting stays open to any member, as the comments ticket specifies', async () => {
    const { projectId, taskId } = await setup();
    const token = await memberToken(projectId);

    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', token)
      .send({ body: 'A reader can still comment.' })
      .expect(201);
  });
});
