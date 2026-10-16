import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ROADMAP = `# Roadmap

## Active work

| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|
| N-1 | Ship the importer | The importer reads a CSV, validates its header and reports every bad row, with a count | it reads a CSV | IN_PROGRESS | — | — | — |

<!-- context:end -->

## Near term

| ID | Name | Acceptance check | Status | Depends on |
|---|---|---|---|---|
| N-2 | Add single sign on | a user signs in | TODO | — |

## Plan

**Vision:** a tool that imports CSV files.

### F01 — Import

#### F01-E01 — CSV

| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|
| F01-E01-T01 | Validate headers | A bad header is reported with the line and the column it was found in | a bad header is reported | TODO | — | — | — |

## Gaps, Bugs & Technical Debt

| ID | Name | Severity | Phase | Description | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|---|
| F01-BUG-01 | The importer drops the last row | High | F01 | The importer drops the last row of a file that has no trailing newline | TODO | — | — | — |

## Out of scope

- Anything else.
`;

const LEDGER = `# Agents log

## Entry format

\`\`\`markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS | Name
- Summary: what the agent will do or did
- Verify: command and result, or "pending" (required for DONE and REVIEW)
\`\`\`

## Entries

## [2026-10-16T10:00:00Z] | tester | N-1 | IN_PROGRESS | Ship the importer
- Summary: started
- Verify: pending

## [2026-10-16T10:30:00Z] | tester | N-1 | DONE | Ship the importer
- Summary: finished
- Verify: pnpm test
`;

/**
 * The latest project-documentation skill names every Roadmap row with a Name of 10 words or fewer and keeps the
 * rest in a Description, and writes it after the status in the ledger. The title of a task is its Name; a row
 * PM Hub writes has a Name the skill's own check accepts (Roadmap TASK-26, GAP-43).
 */
describe('The Name and Description of the latest skill (e2e, Roadmap TASK-26)', () => {
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

  async function project() {
    const docsPath = createScratchDocsPath();
    writeFileSync(path.join(docsPath, 'Roadmap.md'), ROADMAP, 'utf-8');
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Skill name E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
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
    return new Map<string, { id: string; title: string; status: string }>(
      res.body.map((task: { externalId: string }) => [task.externalId, task]),
    );
  }

  it('takes the Name of a row as the title of its task, in every table, and never queues one for normalization', async () => {
    const { projectId } = await project();

    const run = await sync(projectId).expect(201);

    expect(run.body.summary).toMatchObject({
      entryErrors: [],
      conflictsRaised: 0,
    });
    const all = await tasks(projectId);
    expect(
      Object.fromEntries([...all].map(([id, task]) => [id, task.title])),
    ).toEqual({
      'N-1': 'Ship the importer',
      'N-2': 'Add single sign on',
      'F01-E01-T01': 'Validate headers',
      'F01-BUG-01': 'The importer drops the last row',
    });
    expect(all.get('N-1')!.status).toBe('EN_DESARROLLO');
  });

  it('writes a task created in the app as a row with a Name of 10 words or fewer and the whole title as its Description', async () => {
    const { projectId, docsPath } = await project();
    await sync(projectId).expect(201);
    const title =
      'Make the importer report every row it had to skip, with the reason';

    const created = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Every skipped row is reported' })
      .expect(201);

    const row = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')
      .split('\n')
      .find((line) => line.startsWith(`| ${created.body.externalId} |`))!;
    const cells = row
      .split('|')
      .map((cell) => cell.trim())
      .slice(1, -1);
    expect(cells[1].split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(cells[1]).toBe('Make the importer report every row it had to skip,');
    expect(cells[2]).toBe(title);
    expect(cells[3]).toBe('Every skipped row is reported');
  });

  it('does not raise a conflict, or move the title, when the next sync reads the row it just wrote', async () => {
    const { projectId } = await project();
    await sync(projectId).expect(201);
    const title =
      'Make the importer report every row it had to skip, with the reason';
    const created = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Every skipped row is reported' })
      .expect(201);

    const run = await sync(projectId).expect(201);

    expect(run.body.summary).toMatchObject({
      conflictsRaised: 0,
      entryErrors: [],
    });
    const all = await tasks(projectId);
    expect(all.get(created.body.externalId)!.title).toBe(title);
  });

  it('writes a title edited in the app into the Name only, leaving the Description the document has', async () => {
    const { projectId, docsPath } = await project();
    await sync(projectId).expect(201);
    const id = (await tasks(projectId)).get('N-1')!.id;

    await request(server())
      .patch(`/projects/${projectId}/tasks/${id}`)
      .set('Authorization', auth())
      .send({ title: 'Ship the new importer' })
      .expect(200);

    const row = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')
      .split('\n')
      .find((line) => line.startsWith('| N-1 |'))!;
    const cells = row
      .split('|')
      .map((cell) => cell.trim())
      .slice(1, -1);
    expect(cells[1]).toBe('Ship the new importer');
    expect(cells[2]).toBe(
      'The importer reads a CSV, validates its header and reports every bad row, with a count',
    );
  });

  it('reads the status a ledger entry says before its Name, so a DONE | Name still closes the span of the task', async () => {
    const { projectId } = await project();
    await sync(projectId).expect(201);

    const res = await request(server())
      .get(`/projects/${projectId}/metrics/spans`)
      .set('Authorization', auth())
      .expect(200);

    expect(res.body.spans['N-1']).toEqual({
      startedAt: '2026-10-16T10:00:00.000Z',
      doneAt: '2026-10-16T10:30:00.000Z',
    });
  });
});
