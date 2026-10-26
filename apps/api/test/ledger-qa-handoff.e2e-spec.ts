import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/** The repository's own copy of the skill: the commands an agent runs. */
const SKILL = path
  .resolve(
    process.cwd(),
    '../../.claude/skills/project-documentation/scripts/project_docs.sh',
  )
  .replace(/\\/g, '/');
const HAS_SH = spawnSync('sh', ['-c', 'true']).status === 0;

/** The skill's own Roadmap template with one task ready to take in Active work. */
const TEMPLATE_ROADMAP = readFileSync(
  path.resolve(path.dirname(SKILL), '../templates/Roadmap.md'),
  'utf-8',
).replace(/\r\n/g, '\n');
const ROADMAP = (id: string) =>
  TEMPLATE_ROADMAP.replace(
    '| — | — | — | — | — | — | — | — |',
    `| ${id} | Work | Work to do. | It works. | TODO | — | — | — |`,
  );

/** A Roadmap in the older format the skill's ledger does not apply to: no `Pause reason` column. */
const OLD_FORMAT_ROADMAP = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;

const TASK = 'TASK-01';

/**
 * A move to QA, its approval and its return reach the ledger as the skill's review stage in a project that
 * asked for it, and nowhere else (Roadmap TASK-08, GAP-40).
 */
describe('The QA handoff in the ledger (e2e, Roadmap TASK-08)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerName: string;

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
    ownerName = (
      await request(server())
        .get('/auth/me')
        .set('Authorization', auth())
        .expect(200)
    ).body.displayName;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const run = (...args: string[]) =>
    spawnSync('sh', [SKILL, ...args], { encoding: 'utf-8' });

  /** <tmp>/repo/{AGENTS.md, docs/...}: the layout the skill makes, with one task ready to take. */
  function createRepo(roadmap: string, withSkill = false) {
    const repo = mkdtempSync(path.join(tmpdir(), 'pmhybrid-e2e-qa-'));
    const docs = path.join(repo, 'docs');
    mkdirSync(docs);
    writeFileSync(path.join(docs, 'Roadmap.md'), roadmap, 'utf-8');
    const repoPath = repo.replace(/\\/g, '/');
    if (HAS_SH && withSkill) {
      expect(run('init', repoPath).status).toBe(0);
    } else {
      writeFileSync(
        path.join(docs, 'Agentslog.md'),
        '# Agents log\n\n## Entries\n',
        'utf-8',
      );
    }
    return { repo: repoPath, docs };
  }

  const ledgerOf = (docs: string) =>
    readFileSync(path.join(docs, 'Agentslog.md'), 'utf-8');

  /** `agent | STATUS` of each entry the ledger holds for the task, oldest first. */
  const entriesOf = (docs: string, taskId = TASK) =>
    [
      ...ledgerOf(docs).matchAll(
        /^## \[\d{4}[^\]]*\] \| (.+?) \| (\S+) \| (\S+)/gm,
      ),
    ]
      .filter((match) => match[2] === taskId)
      .map((match) => `${match[1]} | ${match[3]}`);

  async function createAgent() {
    const ledgerName = unique('agent');
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({
        displayName: unique('Agent'),
        providerType: 'custom',
        ledgerName,
      })
      .expect(201);
    return { id: created.body.id as string, ledgerName };
  }

  async function addMember(projectId: string, actorId: string) {
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, actorId, 'DEVELOPER');
  }

  /** A project over the repo with a developer agent and a reviewer agent as members. */
  async function projectOver(docs: string, options: { handoff: boolean }) {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('QA handoff E2E'), docsPath: docs })
      .expect(201);
    const projectId = created.body.id as string;
    if (options.handoff) {
      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ ledgerQaHandoff: true })
        .expect(200);
    }
    const developer = await createAgent();
    const reviewer = await createAgent();
    await addMember(projectId, developer.id);
    await addMember(projectId, reviewer.id);
    return { projectId, developer, reviewer };
  }

  /** The task of the Roadmap row, read by a sync and assigned to the developer. */
  async function taskInProject(projectId: string, developerId: string) {
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const taskId = (tasks.body as { id: string }[])[0].id;
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId: developerId })
      .expect(201);
    return taskId;
  }

  const move = (
    projectId: string,
    taskId: string,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send(body);

  const statusOf = async (taskId: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status;
  const titleOf = async (taskId: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).title;

  /** A task a developer holds, in development, in a project over the skill's repo. */
  async function developing(handoff: boolean, withSkill = false) {
    const { repo, docs } = createRepo(ROADMAP(TASK), withSkill);
    const { projectId, developer, reviewer } = await projectOver(docs, {
      handoff,
    });
    const taskId = await taskInProject(projectId, developer.id);
    await move(projectId, taskId, { status: 'EN_DESARROLLO' }).expect(201);
    return { repo, docs, projectId, taskId, developer, reviewer };
  }

  describe('the switch', () => {
    it('is off for every project, and is turned on and off with the project settings', async () => {
      const created = await request(server())
        .post('/projects')
        .set('Authorization', auth())
        .send({
          name: unique('QA handoff switch'),
          docsPath: createScratchDocsPath(),
        })
        .expect(201);
      const url = `/projects/${created.body.id}`;
      const patch = (ledgerQaHandoff: boolean) =>
        request(server())
          .patch(url)
          .set('Authorization', auth())
          .send({ ledgerQaHandoff })
          .expect(200);

      const on = await patch(true);
      const off = await patch(false);

      expect(created.body.ledgerQaHandoff).toBe(false);
      expect(on.body.ledgerQaHandoff).toBe(true);
      expect(off.body.ledgerQaHandoff).toBe(false);
    });

    it('refuses a value that is not a boolean', async () => {
      const created = await request(server())
        .post('/projects')
        .set('Authorization', auth())
        .send({
          name: unique('QA handoff switch'),
          docsPath: createScratchDocsPath(),
        })
        .expect(201);

      await request(server())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', auth())
        .send({ ledgerQaHandoff: 'yes' })
        .expect(400);
    });
  });

  describe('with the switch off', () => {
    it('writes nothing to the ledger for a move to QA, as before', async () => {
      const { docs, projectId, taskId, reviewer } = await developing(false);
      const before = ledgerOf(docs);

      await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
      }).expect(201);

      expect(await statusOf(taskId)).toBe('QA');
      expect(ledgerOf(docs)).toBe(before);
    });
  });

  describe('with the switch on', () => {
    it('hands the task over as a REVIEW entry in the holder name that names the reviewer', async () => {
      const { docs, projectId, taskId, developer, reviewer } =
        await developing(true);

      await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
        note: 'ready for a look',
      }).expect(201);

      expect(entriesOf(docs)).toEqual([
        `${developer.ledgerName} | IN_PROGRESS`,
        `${developer.ledgerName} | REVIEW`,
      ]);
      const ledger = ledgerOf(docs);
      expect(ledger).toContain(`- Handoff: ${reviewer.ledgerName}`);
      expect(ledger).toContain(
        `Handed to review: ${await titleOf(taskId)} - ready for a look`,
      );
    });

    it.skipIf(!HAS_SH)(
      'leaves a ledger the skill check accepts, and that the skill reads as a task waiting for its reviewer',
      async () => {
        const { repo, projectId, taskId, developer, reviewer } =
          await developing(true, true);

        await move(projectId, taskId, {
          status: 'QA',
          reviewerActorId: reviewer.id,
        }).expect(201);

        const check = run('check', repo);
        expect(check.status, `${check.stdout}${check.stderr}`).toBe(0);
        // `status` prints "TASK | Name | holder | stage | age | reason": REVIEW->reviewer is the handoff.
        expect(run('status', repo).stdout).toMatch(
          new RegExp(
            `${TASK} \\| [^|]* \\| ${developer.ledgerName} \\| REVIEW->${reviewer.ledgerName} \\|`,
          ),
        );
      },
      120_000,
    );

    it('records the handoff without a Handoff bullet when nobody was asked to review', async () => {
      const { docs, projectId, taskId } = await developing(true);

      await move(projectId, taskId, { status: 'QA' }).expect(201);

      // The ledger's own header documents the bullet, so only the entries are looked at.
      expect(ledgerOf(docs).split('## Entries')[1]).not.toContain('- Handoff:');
      expect(entriesOf(docs).at(-1)).toMatch(/\| REVIEW$/);
    });

    it.skipIf(!HAS_SH)(
      'passes the review in the approver name and closes the task, and the skill check accepts it',
      async () => {
        const { repo, docs, projectId, taskId, developer, reviewer } =
          await developing(true, true);
        await move(projectId, taskId, {
          status: 'QA',
          reviewerActorId: reviewer.id,
        }).expect(201);

        await move(projectId, taskId, { status: 'TERMINADA' }).expect(201);

        expect(entriesOf(docs)).toEqual([
          `${developer.ledgerName} | IN_PROGRESS`,
          `${developer.ledgerName} | REVIEW`,
          `${ownerName} | REVIEW`,
          `${ownerName} | DONE`,
        ]);
        expect(ledgerOf(docs)).toContain(
          `- Review: PASS - approved in PM Hub by ${ownerName}`,
        );
        const check = run('check', repo);
        expect(check.status, `${check.stdout}${check.stderr}`).toBe(0);
      },
      120_000,
    );

    it.skipIf(!HAS_SH)(
      'sends the task back as a failed review in the sender name with the reason, and the holder carries on with the skill',
      async () => {
        const { repo, docs, projectId, taskId, developer, reviewer } =
          await developing(true, true);
        await move(projectId, taskId, {
          status: 'QA',
          reviewerActorId: reviewer.id,
        }).expect(201);

        await move(projectId, taskId, {
          status: 'EN_DESARROLLO',
          note: 'the importer drops the last row',
        }).expect(201);

        expect(entriesOf(docs)).toEqual([
          `${developer.ledgerName} | IN_PROGRESS`,
          `${developer.ledgerName} | REVIEW`,
          `${ownerName} | REVIEW`,
          `${developer.ledgerName} | IN_PROGRESS`,
        ]);
        const ledger = ledgerOf(docs);
        expect(ledger).toContain(
          '- Review: FAIL - the importer drops the last row',
        );
        expect(ledger).toContain(
          `Back in development after review: ${await titleOf(taskId)} (the importer drops the last row)`,
        );
        const check = run('check', repo);
        expect(check.status, `${check.stdout}${check.stderr}`).toBe(0);
        // The developer holds it again: the skill lets them finish it.
        const done = run(
          'done',
          repo,
          developer.ledgerName,
          TASK,
          'fixed the last row',
          'importer.ts',
          'importer tests pass',
        );
        expect(done.status, `${done.stdout}${done.stderr}`).toBe(0);
        const closed = run('check', repo);
        expect(closed.status, `${closed.stdout}${closed.stderr}`).toBe(0);
      },
      120_000,
    );

    it('hands a returned task over again on the claim the holder already has, with no second claim', async () => {
      const { docs, projectId, taskId, developer, reviewer } =
        await developing(true);
      await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
      }).expect(201);
      await move(projectId, taskId, { status: 'EN_DESARROLLO' }).expect(201);

      await move(projectId, taskId, { status: 'QA' }).expect(201);

      expect(entriesOf(docs)).toEqual([
        `${developer.ledgerName} | IN_PROGRESS`,
        `${developer.ledgerName} | REVIEW`,
        `${ownerName} | REVIEW`,
        `${developer.ledgerName} | IN_PROGRESS`,
        `${developer.ledgerName} | REVIEW`,
      ]);
    });

    it('rolls the move back when the ledger cannot be written, so a retry hands over exactly once', async () => {
      const { docs, projectId, taskId, reviewer } = await developing(true);
      const savedLedger = ledgerOf(docs);
      const savedRoadmap = readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8');
      rmSync(docs, { recursive: true, force: true });

      const failed = await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
      }).expect(422);

      expect(failed.body.message).toMatch(/^Not saved: /);
      expect(await statusOf(taskId)).toBe('EN_DESARROLLO');
      mkdirSync(docs, { recursive: true });
      writeFileSync(path.join(docs, 'Roadmap.md'), savedRoadmap, 'utf-8');
      writeFileSync(path.join(docs, 'Agentslog.md'), savedLedger, 'utf-8');
      await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
      }).expect(201);
      expect(
        entriesOf(docs).filter((entry) => entry.endsWith('| REVIEW')),
      ).toHaveLength(1);
    });

    it('writes no review stage into a Roadmap of the older format, whose ledger has none', async () => {
      const { docs } = createRepo(OLD_FORMAT_ROADMAP, false);
      const { projectId, developer, reviewer } = await projectOver(docs, {
        handoff: true,
      });
      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title: 'Old format task', acceptanceCriteria: 'Verified' })
        .expect(201);
      const taskId = created.body.id as string;
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth())
        .send({ actorId: developer.id })
        .expect(201);
      await move(projectId, taskId, { status: 'EN_DESARROLLO' }).expect(201);
      const before = ledgerOf(docs);

      await move(projectId, taskId, {
        status: 'QA',
        reviewerActorId: reviewer.id,
      }).expect(201);

      expect(ledgerOf(docs)).toBe(before);
      expect(readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8')).toMatch(
        /\|\s*QA\s*\|/,
      );
    });
  });

  describe('the note', () => {
    it('is refused with a move that is neither a handoff nor the answer to one', async () => {
      const { projectId, taskId } = await developing(false);

      await move(projectId, taskId, {
        status: 'ASIGNADA',
        note: 'not a handoff',
      }).expect(400);

      expect(await statusOf(taskId)).toBe('EN_DESARROLLO');
    });

    it('is kept in the audit of the move when the project does not write the ledger', async () => {
      const { projectId, taskId } = await developing(false);

      await move(projectId, taskId, {
        status: 'QA',
        note: 'ready for a look',
      }).expect(201);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { entityId: taskId, operation: 'STATUS_CHANGE' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(audit.newValue).toMatchObject({
        status: 'QA',
        note: 'ready for a look',
      });
    });
  });
});
