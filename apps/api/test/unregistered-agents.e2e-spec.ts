import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';

const ROADMAP = `# Roadmap

## Active work

| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|
| TASK-01 | First | First task. | It works. | TODO | — | — | — |
| TASK-02 | Second | Second task. | It works. | TODO | — | — | — |
| TASK-03 | Third | Third task. | It works. | TODO | — | — | — |
`;

const entry = (at: string, agent: string, task: string, status: string) =>
  `## [${at}] | ${agent} | ${task} | ${status}\n- Summary: ${status} ${task}\n- Verify: pending\n`;

/**
 * A ledger with two agents nobody registered: `ghost` with three entries on two tasks, one of them
 * spelled differently, and `other` with one. The names are the test's own: agents are shared by
 * the whole instance, so a name one test registers must not be another's.
 */
const ledgerOf = (ghost: string, other: string) => `# Agents log

## Entries

${[
  entry('2026-10-01T10:00:00Z', ghost, 'TASK-01', 'IN_PROGRESS'),
  entry('2026-10-03T10:00:00Z', ghost, 'TASK-01', 'PAUSE').replace(
    '- Verify: pending',
    '- Pause: OTRO - waiting',
  ),
  entry(
    '2026-10-05T10:00:00Z',
    `${ghost.toUpperCase()} `,
    'TASK-02',
    'IN_PROGRESS',
  ),
  entry('2026-10-02T10:00:00Z', other, 'TASK-03', 'IN_PROGRESS'),
].join('\n')}`;

/**
 * The ledger names nobody registered, and registering one when a person asks (Roadmap TASK-03,
 * DEC-004 D2): never silently, and never as a way round the permissions.
 */
describe('Agents the ledger names that nobody registered (e2e, Roadmap TASK-03)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;

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
    adminToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = adminToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** A project over a ledger that names two agents nobody registered, synced once. */
  async function projectWithGhosts() {
    const ghost = unique('ghost');
    const other = unique('other');
    const docs = mkdtempSync(path.join(tmpdir(), 'pmhybrid-e2e-ghosts-'));
    mkdirSync(docs, { recursive: true });
    writeFileSync(path.join(docs, 'Roadmap.md'), ROADMAP, 'utf-8');
    writeFileSync(
      path.join(docs, 'Agentslog.md'),
      ledgerOf(ghost, other),
      'utf-8',
    );
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Ghosts E2E'), docsPath: docs })
      .expect(201);
    const projectId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    return { projectId, ghost, other };
  }

  /** A person who can log in, a member of the project with the given project role, and no global role. */
  async function memberWith(projectId: string, role: string) {
    const email = `${unique('member')}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Member', email, password: 'password123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.body.id })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, user.body.id, role);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  const listed = (projectId: string, token = adminToken) =>
    request(server())
      .get(`/projects/${projectId}/agents/unregistered`)
      .set('Authorization', auth(token));

  const register = (projectId: string, name: string, token = adminToken) =>
    request(server())
      .post(`/projects/${projectId}/agents/unregistered`)
      .set('Authorization', auth(token))
      .send({ name });

  const namesOf = async (projectId: string) =>
    ((await listed(projectId).expect(200)).body as { name: string }[]).map(
      (item) => item.name,
    );

  describe('the list', () => {
    it('names each agent the ledger carries that nobody answers to, with its entries, tasks and dates', async () => {
      const { projectId, ghost, other } = await projectWithGhosts();

      const res = await listed(projectId).expect(200);

      expect(res.body).toEqual([
        {
          name: ghost,
          entries: 3,
          tasks: 2,
          firstSeen: '2026-10-01T10:00:00.000Z',
          lastSeen: '2026-10-05T10:00:00.000Z',
          reason: 'UNKNOWN',
        },
        {
          name: other,
          entries: 1,
          tasks: 1,
          firstSeen: '2026-10-02T10:00:00.000Z',
          lastSeen: '2026-10-02T10:00:00.000Z',
          reason: 'UNKNOWN',
        },
      ]);
    });

    it('is empty for a project whose ledger names only registered agents', async () => {
      const created = await request(server())
        .post('/projects')
        .set('Authorization', auth())
        .send({
          name: unique('No ghosts'),
          docsPath: mkdtempSync(path.join(tmpdir(), 'pmhybrid-e2e-clean-')),
        })
        .expect(201);

      const res = await listed(created.body.id).expect(200);

      expect(res.body).toEqual([]);
    });

    it('is refused to a member who cannot manage the project members', async () => {
      const { projectId } = await projectWithGhosts();
      const viewer = await memberWith(projectId, 'VIEWER');

      await listed(projectId, viewer).expect(403);
    });

    it('is refused to someone who is not a member of the project', async () => {
      const { projectId } = await projectWithGhosts();
      const elsewhere = await projectWithGhosts();
      const outsider = await memberWith(elsewhere.projectId, 'PROJECT_ADMIN');

      await listed(projectId, outsider).expect(403);
    });
  });

  describe('registering one', () => {
    it('creates the agent with the name as its display name and as an alias, and makes it a member', async () => {
      const { projectId, ghost } = await projectWithGhosts();

      const res = await register(projectId, ghost).expect(201);

      expect(res.body.displayName).toBe(ghost);
      expect(res.body.kind).toBe('AI_AGENT');
      expect(res.body.agentProfile.aliases).toEqual([ghost]);
      const member = await prisma.projectMember.findFirst({
        where: { projectId, actorId: res.body.id, isActive: true },
      });
      expect(member).not.toBeNull();
    });

    it('takes the name off the list and links the entries to the agent at once', async () => {
      const { projectId, ghost, other } = await projectWithGhosts();

      const res = await register(projectId, ghost).expect(201);

      expect(await namesOf(projectId)).toEqual([other]);
      const linked = await prisma.agentLogEvent.count({
        where: { projectId, agentActorId: res.body.id },
      });
      expect(linked).toBe(3);
    });

    it('finds the name whatever its case or spacing, and registers it as the ledger spells it', async () => {
      const { projectId, ghost } = await projectWithGhosts();

      const res = await register(projectId, `  ${ghost.toUpperCase()} `).expect(
        201,
      );

      expect(res.body.displayName).toBe(ghost);
    });

    it('is audited as the creation of the agent, the new member and the registration from the ledger', async () => {
      const { projectId, other } = await projectWithGhosts();

      const res = await register(projectId, other).expect(201);

      const operations = (
        await prisma.auditEvent.findMany({
          where: {
            OR: [
              { entityId: res.body.id },
              { projectId, operation: 'MEMBER_ADD' },
            ],
          },
        })
      ).map((event) => event.operation);
      expect(operations).toEqual(
        expect.arrayContaining([
          'CREATE',
          'MEMBER_ADD',
          'AGENT_REGISTERED_FROM_LEDGER',
        ]),
      );
    });

    it('refuses a name the ledger does not carry, so it is no second way to create any agent', async () => {
      const { projectId } = await projectWithGhosts();
      const made = unique('made-up');

      await register(projectId, made).expect(400);

      expect(await prisma.actor.count({ where: { displayName: made } })).toBe(
        0,
      );
    });

    it('refuses a name that was registered already, and creates no second agent', async () => {
      const { projectId, ghost } = await projectWithGhosts();
      await register(projectId, ghost).expect(201);

      await register(projectId, ghost).expect(400);

      expect(await prisma.actor.count({ where: { displayName: ghost } })).toBe(
        1,
      );
    });

    it('is refused to someone who manages the members but cannot create agents', async () => {
      const { projectId, ghost } = await projectWithGhosts();
      const projectAdmin = await memberWith(projectId, 'PROJECT_ADMIN');

      const res = await register(projectId, ghost, projectAdmin).expect(403);

      expect(res.body.message).toBe('Missing permission: actors.manage');
      expect(await namesOf(projectId)).toContain(ghost);
    });

    it('is refused to a viewer', async () => {
      const { projectId, ghost } = await projectWithGhosts();
      const viewer = await memberWith(projectId, 'VIEWER');

      await register(projectId, ghost, viewer).expect(403);
    });
  });
});
