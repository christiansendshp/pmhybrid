import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { MOUNT_A, MOUNTED_HOST_WINDOWS } from './helpers/host-mounts.js';

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
    expect(res.body.roots.map((r: { path: string }) => r.path)).toContain(res.body.root);
    const roadmap = res.body.documents.find((d: { kind: string }) => d.kind === 'roadmap');
    const agentslog = res.body.documents.find((d: { kind: string }) => d.kind === 'agentslog');
    expect(roadmap).toMatchObject({ filename: 'Roadmap.md', found: true });
    expect(agentslog).toMatchObject({ filename: 'Agentslog.md', found: true });
  });

  describe('as a folder explorer over a mounted folder (Roadmap UX-05)', () => {
    beforeAll(() => {
      mkdirSync(path.join(MOUNT_A, 'sub', 'deeper'), { recursive: true });
      writeFileSync(path.join(MOUNT_A, 'sub', 'Roadmap.md'), '# Roadmap');
    });

    afterAll(() => {
      // Only its own folder: projects.e2e-spec.ts works in the same mount, in parallel.
      rmSync(path.join(MOUNT_A, 'sub'), { recursive: true, force: true });
    });

    const browse = (query: string) =>
      request(app.getHttpServer())
        .get('/filesystem-browser/browse')
        .query({ path: query })
        .set('Authorization', `Bearer ${token}`);

    it('shows the folder as the user knows it, with the way from the root and the quick access named the same way', async () => {
      const res = await browse(path.join(MOUNT_A, 'sub', 'deeper')).expect(200);

      expect(res.body.path).toBe(path.join(MOUNT_A, 'sub', 'deeper'));
      expect(res.body.displayPath).toBe(`${MOUNTED_HOST_WINDOWS}\\sub\\deeper`);
      const names = res.body.breadcrumbs.map((crumb: { name: string }) => crumb.name);
      expect(names.slice(-3)).toEqual([path.basename(MOUNT_A), 'sub', 'deeper']);
      expect(res.body.breadcrumbs.at(-1).path).toBe(res.body.path);
      expect(res.body.roots.length).toBeGreaterThan(0);
      for (const root of res.body.roots) {
        expect(typeof root.label).toBe('string');
      }
    });

    it('takes a path typed the Windows way and answers with the folder as the API sees it', async () => {
      const res = await browse(`${MOUNTED_HOST_WINDOWS}\\sub`).expect(200);

      expect(res.body.path).toBe(path.join(MOUNT_A, 'sub'));
      expect(res.body.directories.map((d: { name: string }) => d.name)).toEqual(['deeper']);
      expect(
        res.body.documents.find((d: { kind: string }) => d.kind === 'roadmap'),
      ).toMatchObject({ found: true });
    });

    it('still refuses a Windows path that leads out of the mounted folder', async () => {
      await browse(`${MOUNTED_HOST_WINDOWS}\\..\\..\\Windows`).expect(400);
      await browse('D:\\somewhere\\else').expect(400);
    });
  });

  it('refuses to browse outside the configured root', async () => {
    await request(app.getHttpServer())
      .get('/filesystem-browser/browse')
      .query({ path: process.platform === 'win32' ? 'C:\\Windows' : '/etc' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
