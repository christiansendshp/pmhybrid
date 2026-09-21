import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(
  id: string,
  type: string,
  parent?: string,
  lines: string[] = [],
  status = 'READY',
): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    `type: ${type}`,
    `title: Title of ${id}`,
    `status: ${status}`,
    ...(parent ? [`parent: ${parent}`] : []),
    ...lines,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

/**
 * The document's `parent` links were ignored, so PHASE and EPIC entries became
 * flat tasks and `/progress` reported no phases (Roadmap GAP-35d).
 */
describe('Hierarchy of a YAML Roadmap (e2e, Roadmap GAP-35d)', () => {
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
    `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Hierarchy E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  interface TaskView {
    id: string;
    parentTaskId: string | null;
    epicId: string | null;
    phaseId: string | null;
  }

  async function tasks(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as (TaskView & { externalId: string })[];
  }

  async function taskOf(projectId: string, externalId: string) {
    return (await tasks(projectId)).find(
      (task) => task.externalId === externalId,
    )!;
  }

  async function listOf(projectId: string, kind: 'phases' | 'epics') {
    const res = await request(server())
      .get(`/projects/${projectId}/${kind}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as {
      id: string;
      externalId: string | null;
      name: string;
      phaseId?: string | null;
    }[];
  }

  const patch = (projectId: string, taskId: string, body: object) =>
    request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send(body);

  const SPINE = roadmap(
    entry('HV-1', 'VISION'),
    entry('HP-1', 'PHASE', 'HV-1'),
    entry('HE-1', 'EPIC', 'HP-1'),
    entry('HF-1', 'FEATURE', 'HE-1'),
    entry('HT-1', 'TASK', 'HF-1'),
    entry('HT-2', 'TASK', 'HE-1'),
    entry('HT-3', 'TASK', 'HP-1'),
    entry('HG-1', 'GAP'),
  );

  describe('reading', () => {
    it('makes a phase and an epic of the PHASE and EPIC entries, and places every other entry where its parent chain says', async () => {
      const docsPath = createScratchDocsPath();
      writeFileSync(path.join(docsPath, 'Roadmap.md'), SPINE, 'utf-8');
      const projectId = await createProject(docsPath);

      const run = await sync(projectId);

      const phases = await listOf(projectId, 'phases');
      const epics = await listOf(projectId, 'epics');
      expect(phases).toHaveLength(1);
      expect(phases[0]).toMatchObject({
        externalId: 'HP-1',
        name: 'Title of HP-1',
      });
      expect(epics).toHaveLength(1);
      expect(epics[0]).toMatchObject({
        externalId: 'HE-1',
        phaseId: phases[0].id,
      });
      expect(run.body.summary).toMatchObject({
        structureSynced: 2,
        placementsChanged: 4,
      });

      // The phase and the epic are not tasks any more.
      const all = await tasks(projectId);
      expect(all.map((task) => task.externalId).sort()).toEqual([
        'HF-1',
        'HG-1',
        'HT-1',
        'HT-2',
        'HT-3',
        'HV-1',
      ]);
      const feature = await taskOf(projectId, 'HF-1');
      expect(feature).toMatchObject({
        parentTaskId: null,
        epicId: epics[0].id,
        phaseId: phases[0].id,
      });
      expect(await taskOf(projectId, 'HT-1')).toMatchObject({
        parentTaskId: feature.id,
        epicId: null,
        phaseId: null,
      });
      expect(await taskOf(projectId, 'HT-2')).toMatchObject({
        parentTaskId: null,
        epicId: epics[0].id,
        phaseId: phases[0].id,
      });
      expect(await taskOf(projectId, 'HT-3')).toMatchObject({
        epicId: null,
        phaseId: phases[0].id,
      });
      // No parent, nothing said.
      expect(await taskOf(projectId, 'HG-1')).toMatchObject({
        parentTaskId: null,
        epicId: null,
        phaseId: null,
      });
    });

    it('shows the document phases in the progress tree, and a second run changes nothing', async () => {
      const docsPath = createScratchDocsPath();
      writeFileSync(path.join(docsPath, 'Roadmap.md'), SPINE, 'utf-8');
      const projectId = await createProject(docsPath);
      await sync(projectId);

      const progress = await request(server())
        .get(`/projects/${projectId}/progress`)
        .set('Authorization', auth())
        .expect(200);
      expect(progress.body.phases).toHaveLength(1);
      expect(progress.body.phases[0].epics).toHaveLength(1);
      expect(
        progress.body.phases[0].epics[0].tasks.map(
          (t: { name: string }) => t.name,
        ),
      ).toEqual(['Title of HF-1', 'Title of HT-2']);

      const again = await sync(projectId);
      expect(again.body.summary).toMatchObject({
        structureSynced: 0,
        placementsChanged: 0,
        structuralTasksRetired: 0,
        conflictsRaised: 0,
      });
    });

    it('follows the document when an entry moves or a phase is renamed, and records the move', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(file, SPINE, 'utf-8');
      const projectId = await createProject(docsPath);
      await sync(projectId);

      writeFileSync(
        file,
        readFileSync(file, 'utf-8')
          .replace(
            'parent: HE-1\n```\n\n### HT-3',
            'parent: HP-1\n```\n\n### HT-3',
          )
          .replace('title: Title of HP-1', 'title: Renamed phase'),
        'utf-8',
      );
      await sync(projectId);

      const phase = (await listOf(projectId, 'phases'))[0];
      expect(phase.name).toBe('Renamed phase');
      // HT-2 now sits straight under the phase.
      expect(await taskOf(projectId, 'HT-2')).toMatchObject({
        epicId: null,
        phaseId: phase.id,
      });
      const audit = await request(server())
        .get(`/projects/${projectId}/audit?entityType=Task`)
        .set('Authorization', auth())
        .expect(200);
      const task = await taskOf(projectId, 'HT-2');
      expect(
        audit.body.some(
          (event: { entityId: string; operation: string }) =>
            event.entityId === task.id &&
            event.operation === 'ROADMAP_FIELD_UPDATE',
        ),
      ).toBe(true);
    });

    it('takes away the task a PHASE or EPIC entry had become, and keeps its subtasks', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      // Before phases and epics were imported, these were tasks.
      writeFileSync(
        file,
        roadmap(entry('HP-1', 'TASK'), entry('HT-1', 'TASK')),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const oldPhaseTask = await taskOf(projectId, 'HP-1');
      const child = await taskOf(projectId, 'HT-1');
      await patch(projectId, child.id, {
        parentTaskId: oldPhaseTask.id,
      }).expect(200);

      writeFileSync(
        file,
        roadmap(entry('HP-1', 'PHASE'), entry('HT-1', 'TASK', 'HP-1')),
        'utf-8',
      );
      const run = await sync(projectId);

      expect(run.body.summary.structuralTasksRetired).toBe(1);
      expect((await tasks(projectId)).map((t) => t.externalId)).toEqual([
        'HT-1',
      ]);
      const phase = (await listOf(projectId, 'phases'))[0];
      expect(await taskOf(projectId, 'HT-1')).toMatchObject({
        parentTaskId: null,
        phaseId: phase.id,
      });
    });

    it('keeps where a task sits when the entry above it leaves the document, and raises nothing for the epic that left', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('HE-1', 'EPIC'), entry('HT-2', 'TASK', 'HE-1')),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const epic = (await listOf(projectId, 'epics'))[0];

      // The schema takes a finished entry out of the file.
      writeFileSync(file, roadmap(entry('HT-2', 'TASK', 'HE-1')), 'utf-8');
      const run = await sync(projectId);

      expect(run.body.summary.conflictsRaised).toBe(0);
      expect((await taskOf(projectId, 'HT-2')).epicId).toBe(epic.id);
      expect(await listOf(projectId, 'epics')).toHaveLength(1);
    });

    it('does not follow a loop of parents', async () => {
      const docsPath = createScratchDocsPath();
      writeFileSync(
        path.join(docsPath, 'Roadmap.md'),
        roadmap(entry('HA-1', 'TASK', 'HB-1'), entry('HB-1', 'TASK', 'HA-1')),
        'utf-8',
      );
      const projectId = await createProject(docsPath);

      const run = await sync(projectId);

      expect(run.body.summary.placementsChanged).toBe(0);
      expect(await taskOf(projectId, 'HA-1')).toMatchObject({
        parentTaskId: null,
      });
    });
  });

  describe('writing', () => {
    async function setup() {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(
          entry('HP-1', 'PHASE'),
          entry('HE-1', 'EPIC', 'HP-1'),
          entry('HE-2', 'EPIC', 'HP-1'),
          entry('HT-1', 'TASK', 'HE-1', ['epic: HE-1']),
        ),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      return { file, projectId };
    }

    it('writes a move to another epic into the entry as its parent', async () => {
      const { file, projectId } = await setup();
      const task = await taskOf(projectId, 'HT-1');
      const other = (await listOf(projectId, 'epics')).find(
        (epic) => epic.externalId === 'HE-2',
      )!;

      await patch(projectId, task.id, { epicId: other.id }).expect(200);

      expect(readFileSync(file, 'utf-8')).toContain('parent: HE-2');
      // What was written is what sync reads: the task stays where it was put.
      const run = await sync(projectId);
      expect(run.body.summary.placementsChanged).toBe(0);
      expect((await taskOf(projectId, 'HT-1')).epicId).toBe(other.id);
    });

    it('takes the parent out of the entry, shortcuts included, when the task is moved out', async () => {
      const { file, projectId } = await setup();
      const task = await taskOf(projectId, 'HT-1');

      await patch(projectId, task.id, { epicId: null, phaseId: null }).expect(
        200,
      );

      const written = readFileSync(file, 'utf-8');
      const block = written.slice(written.indexOf('id: HT-1'));
      expect(block).not.toMatch(/^(parent|epic): /m);
      await sync(projectId);
      expect(await taskOf(projectId, 'HT-1')).toMatchObject({
        epicId: null,
        phaseId: null,
      });
    });

    it('gives a subtask made in PM Hub the entry of a SUBTASK under its parent', async () => {
      const { file, projectId } = await setup();
      const parent = await taskOf(projectId, 'HT-1');

      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({
          title: 'A step',
          acceptanceCriteria: 'Done',
          parentTaskId: parent.id,
        })
        .expect(201);

      const written = readFileSync(file, 'utf-8');
      const block = written.slice(
        written.indexOf(`id: ${created.body.externalId}`),
      );
      expect(block).toContain('type: SUBTASK');
      expect(block).toContain('parent: HT-1');
    });

    it('writes nothing for a place the document has no id for, and the document wins at the next sync', async () => {
      const { file, projectId } = await setup();
      const task = await taskOf(projectId, 'HT-1');
      const madeInTheApp = await request(server())
        .post(`/projects/${projectId}/epics`)
        .set('Authorization', auth())
        .send({ name: 'Made in the app', order: 9 })
        .expect(201);
      const before = readFileSync(file, 'utf-8');

      await patch(projectId, task.id, { epicId: madeInTheApp.body.id }).expect(
        200,
      );

      expect(readFileSync(file, 'utf-8')).toBe(before);
      await sync(projectId);
      // The entry still says HE-1, and where the document says it, it sits.
      const epic = (await listOf(projectId, 'epics')).find(
        (candidate) => candidate.externalId === 'HE-1',
      )!;
      expect((await taskOf(projectId, 'HT-1')).epicId).toBe(epic.id);
    });
  });
});
