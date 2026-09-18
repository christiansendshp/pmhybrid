import { createHmac } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
}

describe('GitHub webhook ingestion (Roadmap GAP-29 — e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
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

  async function createProjectAt(docsPath: string): Promise<string> {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Webhook E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function syncRunsFor(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/sync-runs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    return res.body as { trigger: string; status: string }[];
  }

  it('rejects a delivery with an invalid signature', async () => {
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });
    await request(server())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(body)
      .expect(401);
  });

  it('rejects a delivery with no signature header at all', async () => {
    const body = JSON.stringify({ repository: { full_name: 'acme/widgets' } });
    await request(server())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .send(body)
      .expect(401);
  });

  it('accepts a validly signed ping event and triggers no sync', async () => {
    const body = JSON.stringify({ zen: 'Non-blocking is better than blocking.' });
    const res = await request(server())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', sign(body))
      .send(body)
      .expect(200);
    expect(res.body).toEqual({ matchedProjects: 0 });
  });

  it('is a no-op for a push whose repository does not match any project', async () => {
    const body = JSON.stringify({ repository: { full_name: 'nobody/nothing-e2e' } });
    const res = await request(server())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(body))
      .send(body)
      .expect(200);
    expect(res.body).toEqual({ matchedProjects: 0 });
  });

  it('triggers a real sync (SyncTrigger=WEBHOOK) for the project whose docsPath matches the pushed repository', async () => {
    const docsPath = createScratchDocsPath();
    const projectId = await createProjectAt(docsPath);
    expect(await syncRunsFor(projectId)).toHaveLength(0);

    const body = JSON.stringify({ repository: { full_name: docsPath } });
    const res = await request(server())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(body))
      .send(body)
      .expect(200);
    expect(res.body).toEqual({ matchedProjects: 1 });

    const runs = await syncRunsFor(projectId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: 'WEBHOOK', status: 'SUCCESS' });
  });
});
