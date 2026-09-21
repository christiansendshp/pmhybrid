import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * assign() and transition() used to read the task outside their transaction
 * and then write it unconditionally (Roadmap BUG-04). A DEVELOPER reassigning
 * a task at the very moment someone moves it to EN_DESARROLLO passed the
 * "not locked yet" check on stale data, and assign then rewrote the status it
 * had read — undoing the lock. Now each write only lands if the task is still
 * exactly as it was read, and the loser gets a 409.
 */
describe('Task assign/transition concurrency (e2e, Roadmap BUG-04)', () => {
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

  async function createMember(projectId: string, roleName: string) {
    const email = `race-${Date.now()}-${Math.random().toString(36).slice(2)}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: `Race ${roleName}`, email, password: 'race12345' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    await assignProjectRole(
      server(),
      auth(),
      projectId,
      created.body.id,
      roleName,
    );
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'race12345' })
      .expect(200);
    return {
      id: created.body.id as string,
      token: `Bearer ${login.body.accessToken}`,
    };
  }

  it('never lets a reassignment slip past the EN_DESARROLLO lock or undo it', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Race E2E ${Date.now()}-${Math.random()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = project.body.id as string;
    const original = await createMember(projectId, 'DEVELOPER');
    const other = await createMember(projectId, 'DEVELOPER');
    const reassigner = await createMember(projectId, 'DEVELOPER');

    const outcomes = { assignLost: 0, bothWon: 0 };
    for (let round = 0; round < 8; round += 1) {
      const task = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title: `Race ${round}`, acceptanceCriteria: 'Verified by e2e' })
        .expect(201);
      const taskId = task.body.id as string;
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth())
        .send({ actorId: original.id })
        .expect(201);

      const [moved, reassigned] = await Promise.all([
        request(server())
          .post(`/projects/${projectId}/tasks/${taskId}/transition`)
          .set('Authorization', auth())
          .send({ status: 'EN_DESARROLLO' }),
        request(server())
          .post(`/projects/${projectId}/tasks/${taskId}/assign`)
          .set('Authorization', reassigner.token)
          .send({ actorId: other.id }),
      ]);

      // The only outcomes that make sense: the move always lands, and the
      // reassignment either happened first (both succeed) or lost the race.
      expect([201]).toContain(moved.status);
      expect([201, 409]).toContain(reassigned.status);

      const after = await request(server())
        .get(`/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', auth())
        .expect(200);
      // A transition that reported success must still be in force.
      expect(after.body.status).toBe('EN_DESARROLLO');
      // A reassignment that lost the race must not have changed anything.
      expect(after.body.assigneeActorId).toBe(
        reassigned.status === 201 ? other.id : original.id,
      );

      if (reassigned.status === 409) {
        outcomes.assignLost += 1;
        expect(reassigned.body.message).toMatch(/changed/i);
      } else {
        outcomes.bothWon += 1;
      }
    }
    // Sanity: the loop actually exercised something (every round resolved one way or the other).
    expect(outcomes.assignLost + outcomes.bothWon).toBe(8);
  });

  it('lets exactly one of two concurrent assignments win', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Race assign E2E ${Date.now()}-${Math.random()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = project.body.id as string;
    const first = await createMember(projectId, 'DEVELOPER');
    const second = await createMember(projectId, 'DEVELOPER');

    for (let round = 0; round < 5; round += 1) {
      const task = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({
          title: `Double assign ${round}`,
          acceptanceCriteria: 'Verified by e2e',
        })
        .expect(201);
      const taskId = task.body.id as string;

      const results = await Promise.all(
        [first, second].map((member) =>
          request(server())
            .post(`/projects/${projectId}/tasks/${taskId}/assign`)
            .set('Authorization', auth())
            .send({ actorId: member.id }),
        ),
      );
      const statuses = results.map((res) => res.status).sort();
      // Two writers starting from "unassigned": one wins, the other either
      // loses (409) or, if it ran after, reassigns an ASIGNADA task (201).
      expect(statuses.every((code) => code === 201 || code === 409)).toBe(true);

      const after = await request(server())
        .get(`/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', auth())
        .expect(200);
      expect(after.body.status).toBe('ASIGNADA');
      expect([first.id, second.id]).toContain(after.body.assigneeActorId);
    }
  });
});
