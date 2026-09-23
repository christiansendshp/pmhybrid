import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

describe('Filesystem browser (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let scratchDir: string;

  beforeAll(() => {
    // Inside the default browse root (homedir) so it doesn't need env overrides.
    scratchDir = mkdtempSync(path.join(homedir(), 'pmhybrid-e2e-browse-'));
    mkdirSync(path.join(scratchDir, 'a-project'));
    writeFileSync(path.join(scratchDir, 'a-project', 'Roadmap.md'), '# Roadmap');
    writeFileSync(path.join(scratchDir, 'a-project', 'Agentslog.md'), '# Log');
  });

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

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
    token = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/filesystem-browser/browse')
      .expect(401);
  });

  it('lists a directory and flags Roadmap.md/Agentslog.md presence, for picking a docsPath', async () => {
    const res = await request(app.getHttpServer())
      .get('/filesystem-browser/browse')
      .query({ path: path.join(scratchDir, 'a-project') })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.path).toBe(path.join(scratchDir, 'a-project'));
    expect(res.body.parentPath).toBe(scratchDir);
    // Only the default (homedir) root is configured for this suite -- roots always
    // lists every configured one, `root` included (Roadmap BUG-11).
    expect(res.body.roots).toContain(res.body.root);
    const roadmap = res.body.documents.find((d: { kind: string }) => d.kind === 'roadmap');
    const agentslog = res.body.documents.find((d: { kind: string }) => d.kind === 'agentslog');
    expect(roadmap).toMatchObject({ filename: 'Roadmap.md', found: true });
    expect(agentslog).toMatchObject({ filename: 'Agentslog.md', found: true });
  });

  it('refuses to browse outside the configured root', async () => {
    await request(app.getHttpServer())
      .get('/filesystem-browser/browse')
      .query({ path: process.platform === 'win32' ? 'C:\\Windows' : '/etc' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
