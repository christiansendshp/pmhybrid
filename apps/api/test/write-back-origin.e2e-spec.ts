import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

interface WriteBackEvent {
  operation: string;
  origin: string;
  actorId: string;
  newValue: { trigger?: string } | null;
}

/**
 * What a write to a document says about who made it (Roadmap GAP-44): the change an API key causes is
 * audited, and its revision of the document kept, with the origin of the call and the agent as the actor,
 * not as the application's — a person's change is recorded as it always was.
 */
describe('The origin of a write-back (e2e, Roadmap GAP-44)', () => {
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
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function setUp() {
    const agent = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Origin Agent'), providerType: 'custom' })
      .expect(201);
    const key = await request(server())
      .post(`/agents/${agent.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(201);
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Origin E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agent.body.id })
      .expect(201);
    await assignProjectRole(
      server(),
      auth(),
      projectId,
      agent.body.id,
      'DEVELOPER',
    );
    return {
      projectId,
      agentId: agent.body.id as string,
      apiKey: key.body.key as string,
    };
  }

  /** What the call carries: a person's token, or an API key. */
  type Caller = { bearer: string } | { apiKey: string };
  const withCaller = (req: request.Test, caller: Caller) =>
    'apiKey' in caller
      ? req.set('X-API-Key', caller.apiKey)
      : req.set('Authorization', caller.bearer);

  async function createTask(projectId: string, caller: Caller) {
    const res = await withCaller(
      request(server()).post(`/projects/${projectId}/tasks`),
      caller,
    )
      .send({ title: unique('Origin task'), acceptanceCriteria: 'It says who' })
      .expect(201);
    return res.body.id as string;
  }

  async function writeBacks(projectId: string, taskId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/audit`)
      .query({ entityId: taskId, operation: 'WRITE_BACK' })
      .set('Authorization', auth())
      .expect(200);
    return res.body as WriteBackEvent[];
  }

  async function sources(projectId: string, kind: 'roadmap' | 'agentslog') {
    const res = await request(server())
      .get(`/projects/${projectId}/documents/${kind}/revisions`)
      .set('Authorization', auth())
      .expect(200);
    return (res.body as { source: string }[]).map((r) => r.source);
  }

  it('records the creation an API key caused with the origin API, the agent as actor, and a revision of both documents from the API', async () => {
    const { projectId, agentId, apiKey } = await setUp();

    const taskId = await createTask(projectId, { apiKey });

    const [event] = await writeBacks(projectId, taskId);
    expect(event).toMatchObject({
      operation: 'WRITE_BACK',
      origin: 'API',
      actorId: agentId,
      newValue: { trigger: 'CREATED' },
    });
    expect(await sources(projectId, 'roadmap')).toEqual(['API']);
    expect(await sources(projectId, 'agentslog')).toEqual(['API']);
  });

  it('records the same creation by a person as before: the origin UI, the person as actor, revisions from the application', async () => {
    const { projectId } = await setUp();

    const taskId = await createTask(projectId, { bearer: auth() });

    const [event] = await writeBacks(projectId, taskId);
    expect(event).toMatchObject({
      origin: 'UI',
      newValue: { trigger: 'CREATED' },
    });
    expect(event.actorId).not.toBeNull();
    expect(await sources(projectId, 'roadmap')).toEqual(['UI']);
    expect(await sources(projectId, 'agentslog')).toEqual(['UI']);
  });

  it('records an edit of the title an API key made in the document with the origin API, and one by a person with UI', async () => {
    const { projectId, agentId, apiKey } = await setUp();
    const taskId = await createTask(projectId, { bearer: auth() });

    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('X-API-Key', apiKey)
      .send({ title: unique('Edited by the agent') })
      .expect(200);
    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ title: unique('Edited by a person') })
      .expect(200);

    const edits = (await writeBacks(projectId, taskId)).filter(
      (event) => event.newValue?.trigger === 'FIELD_EDIT',
    );
    // Newest first: the person's edit, then the agent's.
    expect(edits.map((event) => event.origin)).toEqual(['UI', 'API']);
    expect(edits[1].actorId).toBe(agentId);
    expect(await sources(projectId, 'roadmap')).toEqual(['UI', 'API', 'UI']);
  });
});
