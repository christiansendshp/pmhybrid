import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * A dependency added by mistake could not be taken off, in the app or in the
 * document, and the same one could be added twice (Roadmap IMPROVEMENT-01d2).
 */
describe('Removing a dependency, and no duplicates (e2e, Roadmap IMPROVEMENT-01d2)', () => {
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
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function setup() {
    const docsPath = createScratchDocsPath();
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Dependency E2E'), docsPath })
      .expect(201);
    const projectId = project.body.id as string;
    const make = async (title: string) => {
      const res = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title, acceptanceCriteria: 'Verified' })
        .expect(201);
      return {
        id: res.body.id as string,
        externalId: res.body.externalId as string,
      };
    };
    return {
      projectId,
      docsPath,
      dependent: await make('The dependent'),
      first: await make('First prerequisite'),
      second: await make('Second prerequisite'),
    };
  }

  const dependOn = (
    projectId: string,
    taskId: string,
    dependsOnTaskId: string,
  ) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/dependencies`)
      .set('Authorization', auth())
      .send({ dependsOnTaskId });

  async function dependenciesOf(projectId: string, taskId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body.dependencies as {
      id: string;
      dependsOnTaskId: string | null;
    }[];
  }

  /** The "Depends on" cell of a task's row in the Roadmap. */
  function dependsOnCell(docsPath: string, externalId: string): string {
    const line = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')
      .split(/\r?\n/)
      .find((row) => row.startsWith(`| ${externalId} |`))!;
    const cells = line.split('|').map((cell) => cell.trim());
    return cells[6];
  }

  it('takes a dependency off the task and out of the Roadmap row, and records it', async () => {
    const { projectId, docsPath, dependent, first, second } = await setup();
    await dependOn(projectId, dependent.id, first.id).expect(201);
    await dependOn(projectId, dependent.id, second.id).expect(201);
    expect(dependsOnCell(docsPath, dependent.externalId)).toContain(
      first.externalId,
    );
    const [toRemove] = (await dependenciesOf(projectId, dependent.id)).filter(
      (dependency) => dependency.dependsOnTaskId === first.id,
    );

    await request(server())
      .delete(
        `/projects/${projectId}/tasks/${dependent.id}/dependencies/${toRemove.id}`,
      )
      .set('Authorization', auth())
      .expect(200);

    const left = await dependenciesOf(projectId, dependent.id);
    expect(left.map((dependency) => dependency.dependsOnTaskId)).toEqual([
      second.id,
    ]);
    const cell = dependsOnCell(docsPath, dependent.externalId);
    expect(cell).not.toContain(first.externalId);
    expect(cell).toContain(second.externalId);

    const audit = await request(server())
      .get(`/projects/${projectId}/audit?entityType=Task`)
      .set('Authorization', auth())
      .expect(200);
    expect(audit.body).toContainEqual(
      expect.objectContaining({
        operation: 'DEPENDENCY_REMOVE',
        entityId: dependent.id,
        previousValue: expect.objectContaining({ dependsOnTaskId: first.id }),
      }),
    );
  });

  it('empties the cell when the last one goes, and a sync then neither raises a conflict nor puts it back', async () => {
    const { projectId, docsPath, dependent, first } = await setup();
    await dependOn(projectId, dependent.id, first.id).expect(201);
    const [only] = await dependenciesOf(projectId, dependent.id);

    await request(server())
      .delete(
        `/projects/${projectId}/tasks/${dependent.id}/dependencies/${only.id}`,
      )
      .set('Authorization', auth())
      .expect(200);

    expect(dependsOnCell(docsPath, dependent.externalId)).toBe('—');
    const run = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(run.body.summary.conflictsRaised).toBe(0);
    expect(await dependenciesOf(projectId, dependent.id)).toEqual([]);
  });

  it('does not find a dependency of another task, or one that does not exist', async () => {
    const { projectId, dependent, first, second } = await setup();
    await dependOn(projectId, dependent.id, first.id).expect(201);
    const [onDependent] = await dependenciesOf(projectId, dependent.id);

    // Through a task it is not on.
    await request(server())
      .delete(
        `/projects/${projectId}/tasks/${second.id}/dependencies/${onDependent.id}`,
      )
      .set('Authorization', auth())
      .expect(404);
    await request(server())
      .delete(
        `/projects/${projectId}/tasks/${dependent.id}/dependencies/00000000-0000-4000-8000-000000000000`,
      )
      .set('Authorization', auth())
      .expect(404);
    // Untouched.
    expect(await dependenciesOf(projectId, dependent.id)).toHaveLength(1);
  });

  it('needs the permission to write tasks', async () => {
    const { projectId, dependent, first } = await setup();
    await dependOn(projectId, dependent.id, first.id).expect(201);
    const [dependency] = await dependenciesOf(projectId, dependent.id);
    const email = `${unique('outsider')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: unique('Outsider'),
        email,
        password: 'outsider12345',
      })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'outsider12345' })
      .expect(200);

    await request(server())
      .delete(
        `/projects/${projectId}/tasks/${dependent.id}/dependencies/${dependency.id}`,
      )
      .set('Authorization', auth(login.body.accessToken))
      .expect(403);

    expect(await dependenciesOf(projectId, dependent.id)).toHaveLength(1);
  });

  it('refuses the same dependency twice, and leaves the one there', async () => {
    const { projectId, dependent, first } = await setup();
    await dependOn(projectId, dependent.id, first.id).expect(201);

    const again = await dependOn(projectId, dependent.id, first.id).expect(409);

    expect(again.body.message).toBe('The task already depends on that');
    expect(await dependenciesOf(projectId, dependent.id)).toHaveLength(1);
  });

  it('refuses the same outside reference twice as well', async () => {
    const { projectId, dependent } = await setup();
    const withRef = () =>
      request(server())
        .post(`/projects/${projectId}/tasks/${dependent.id}/dependencies`)
        .set('Authorization', auth())
        .send({ rawExternalRef: 'EXT-9' });
    await withRef().expect(201);

    await withRef().expect(409);
  });
});
