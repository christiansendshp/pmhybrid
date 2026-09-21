import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { AgentslogParserService } from './../src/modules/roadmap/agentslog-parser.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import {
  SKILL_AGENTSLOG,
  SKILL_ROADMAP,
} from './../src/modules/roadmap/skill-format.fixtures.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * The latest project-documentation skill writes Markdown tables with a PAUSE
 * state, a Pause reason column, Plan tables and a Gaps table with a
 * Description (Roadmap GAP-37a). Sync used to raise a false "unrecognized
 * status" conflict for every paused row and dropped the Gaps text.
 */
describe('Sync of the latest skill format (e2e, Roadmap GAP-37a)', () => {
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

  async function createSkillProject() {
    const docsPath = createScratchDocsPath();
    writeFileSync(path.join(docsPath, 'Roadmap.md'), SKILL_ROADMAP, 'utf-8');
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      SKILL_AGENTSLOG,
      'utf-8',
    );
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Skill format E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    return { projectId: res.body.id as string, docsPath };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  async function tasks(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return new Map<
      string,
      {
        title: string;
        status: string;
        roadmapTable: string | null;
        blockedReason: string | null;
      }
    >(res.body.map((task: { externalId: string }) => [task.externalId, task]));
  }

  it('reads every table without a conflict or an error, and shows what a blocking pause says', async () => {
    const { projectId } = await createSkillProject();

    const run = await sync(projectId).expect(201);

    expect(run.body.status).toBe('SUCCESS');
    expect(run.body.summary).toMatchObject({
      entryErrors: [],
      conflictsRaised: 0,
    });
    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    expect(conflicts.body).toEqual([]);

    const all = await tasks(projectId);
    expect([...all.keys()].sort()).toEqual(
      [
        'F01-E01-T01',
        'F01-E01-T02',
        'F01-E01-T03',
        'F01-E01-T04',
        'F01-E01-T05',
        'F01-E01-T06',
        'F02-E01-T01',
        'F01-BUG-01',
        'F01-DEBT-01',
      ].sort(),
    );
    expect(all.get('F01-E01-T01')).toMatchObject({ status: 'EN_DESARROLLO' });
    expect(all.get('F01-E01-T05')).toMatchObject({
      status: 'PENDIENTE',
      roadmapTable: 'ACTIVE',
    });
    // A blocking pause is blocked, with the reason; a plain stop is not.
    expect(all.get('F01-E01-T02')).toMatchObject({
      roadmapTable: 'BLOCKED',
      blockedReason: 'BLOQUEO - waiting for the schema review',
    });
    expect(all.get('F01-E01-T04')).toMatchObject({ roadmapTable: 'BLOCKED' });
    expect(all.get('F01-E01-T03')).toMatchObject({
      roadmapTable: 'ACTIVE',
      blockedReason: null,
    });
    // The Gaps table's Description is the title.
    expect(all.get('F01-BUG-01')?.title).toBe(
      'The importer drops the last row of a file without a trailing newline',
    );
    expect(all.get('F02-E01-T01')).toMatchObject({ roadmapTable: 'NEAR_TERM' });
  });

  it('unblocks the task when the skill resumes it, and keeps the dependency it declares', async () => {
    const { projectId, docsPath } = await createSkillProject();
    await sync(projectId).expect(201);

    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      SKILL_ROADMAP.replace(
        '| PAUSE | codex@2026-09-21T11:00:00Z | F01-E01-T01 | BLOQUEO - waiting for the schema review |',
        '| IN_PROGRESS | codex@2026-09-21T15:00:00Z | F01-E01-T01 | — |',
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.summary).toMatchObject({ conflictsRaised: 0 });
    expect((await tasks(projectId)).get('F01-E01-T02')).toMatchObject({
      status: 'EN_DESARROLLO',
      roadmapTable: 'ACTIVE',
      blockedReason: null,
    });
  });

  describe('write-back (Roadmap GAP-37b)', () => {
    const read = (docsPath: string, file: string) =>
      readFileSync(path.join(docsPath, file), 'utf-8');
    /** The cells of a task's row in Roadmap.md: [ID, Outcome, Acceptance check, Status, Owner, ...]. */
    const rowCells = (docsPath: string, id: string) => {
      const line = read(docsPath, 'Roadmap.md')
        .split('\n')
        .find((candidate) => candidate.startsWith(`| ${id} |`));
      return (line ?? '')
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
    };
    const ledgerOf = (docsPath: string, id: string) =>
      new AgentslogParserService()
        .parse(read(docsPath, 'Agentslog.md'))
        .entries.filter((entry) => entry.taskExternalId === id);

    it('writes the skill words to the table and only states its check accepts to the ledger', async () => {
      const { projectId, docsPath } = await createSkillProject();
      await sync(projectId).expect(201);
      const agents = await request(server())
        .get('/agents')
        .set('Authorization', auth())
        .expect(200);
      const agent = agents.body[0] as { id: string; displayName: string };
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: agent.id })
        .expect(201);

      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title: 'Written from the UI', acceptanceCriteria: 'Checked' })
        .expect(201);
      const taskId = created.body.id as string;
      const id = created.body.externalId as string;
      expect(rowCells(docsPath, id).slice(0, 4)).toEqual([
        id,
        'Written from the UI',
        'Checked',
        'TODO',
      ]);
      // Created has no state in the skill, so it writes no entry.
      expect(ledgerOf(docsPath, id)).toEqual([]);

      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth())
        .send({ actorId: agent.id })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/transition`)
        .set('Authorization', auth())
        .send({ status: 'EN_DESARROLLO' })
        .expect(201);
      expect(rowCells(docsPath, id)[3]).toBe('IN_PROGRESS');
      expect(ledgerOf(docsPath, id)).toMatchObject([
        {
          agentName: agent.displayName,
          statusWord: 'IN_PROGRESS',
          verify: 'pending',
        },
      ]);

      // QA is a column the skill's vocabulary does not have: the row stays
      // IN_PROGRESS and nothing is written to the ledger for it.
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/transition`)
        .set('Authorization', auth())
        .send({ status: 'QA' })
        .expect(201);
      expect(rowCells(docsPath, id)[3]).toBe('IN_PROGRESS');
      expect(ledgerOf(docsPath, id)).toHaveLength(1);

      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/transition`)
        .set('Authorization', auth())
        .send({ status: 'TERMINADA' })
        .expect(201);
      const done = ledgerOf(docsPath, id).at(-1)!;
      expect(done.statusWord).toBe('DONE');
      expect(done.verify).toMatch(/marked done in PM Hub/);
      expect(rowCells(docsPath, id)[3]).toBe('DONE');

      // Every Status cell of the document and every ledger state is one the
      // skill's `check` accepts.
      const statuses = [
        ...read(docsPath, 'Roadmap.md').matchAll(
          /^\|.*\| (TODO|IN_PROGRESS|PAUSE|DONE|PENDIENTE|ASIGNADA|EN_DESARROLLO|QA|TERMINADA) \|/gm,
        ),
      ].map((match) => match[1]);
      expect(statuses.length).toBeGreaterThan(8);
      expect(
        statuses.filter(
          (status) =>
            !['TODO', 'IN_PROGRESS', 'PAUSE', 'DONE'].includes(status),
        ),
      ).toEqual([]);
      const states = new AgentslogParserService()
        .parse(read(docsPath, 'Agentslog.md'))
        .entries.map((entry) => entry.statusWord);
      expect(
        states.filter((s) => !['IN_PROGRESS', 'PAUSE', 'DONE'].includes(s)),
      ).toEqual([]);

      // What PM Hub wrote reads back as it was: nothing to reconcile.
      const again = await sync(projectId).expect(201);
      expect(again.body.summary).toMatchObject({
        conflictsRaised: 0,
        entryErrors: [],
      });
    });

    it('edits a Plan row where it is, and removes a task without a ledger entry the skill would reject', async () => {
      const { projectId, docsPath } = await createSkillProject();
      await sync(projectId).expect(201);
      const all = await request(server())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .expect(200);
      const plan = all.body.find(
        (task: { externalId: string }) => task.externalId === 'F01-E01-T05',
      ) as { id: string };

      await request(server())
        .patch(`/projects/${projectId}/tasks/${plan.id}`)
        .set('Authorization', auth())
        .send({ title: 'Validate every header' })
        .expect(200);

      const roadmap = read(docsPath, 'Roadmap.md');
      expect(roadmap.match(/^\| F01-E01-T05 \|/gm)).toHaveLength(1);
      expect(roadmap).toContain('| F01-E01-T05 | Validate every header |');

      const ledgerBefore = read(docsPath, 'Agentslog.md');
      await request(server())
        .delete(`/projects/${projectId}/tasks/${plan.id}`)
        .set('Authorization', auth())
        .expect(200);
      expect(read(docsPath, 'Roadmap.md')).not.toMatch(/^\| F01-E01-T05 \|/m);
      expect(read(docsPath, 'Agentslog.md')).toBe(ledgerBefore);
    });
  });
});
