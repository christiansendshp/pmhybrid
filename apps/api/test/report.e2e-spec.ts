import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { SnapshotService } from './../src/modules/snapshots/snapshot.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

interface Report {
  generatedAt: string;
  from: string;
  to: string;
  markdown: string;
}

/**
 * The weekly status report of a project, in Markdown, built from what the app already computes (Roadmap TASK-48).
 */
describe('Weekly status report (e2e, Roadmap TASK-48)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let snapshots: SnapshotService;
  let token: string;
  let demoActorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    snapshots = moduleFixture.get(SnapshotService);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
    demoActorId = (
      await prisma.actor.findFirstOrThrow({ where: { email: DEMO_EMAIL } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (bearer = token) => `Bearer ${bearer}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function project(
    name = 'Report E2E',
  ): Promise<{ id: string; name: string }> {
    const projectName = unique(name);
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: projectName, docsPath: createScratchDocsPath() })
      .expect(201);
    return { id: created.body.id as string, name: projectName };
  }

  const make = (
    projectId: string,
    externalId: string,
    title: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        externalId,
        title,
        status: data.completedAt ? TaskStatus.TERMINADA : TaskStatus.PENDIENTE,
        rawOwner: 'Someone',
        sourceOrigin: TaskSourceOrigin.UI,
        createdAt: daysAgo(30),
        ...data,
      },
    });

  const report = async (projectId: string, bearer = token): Promise<Report> =>
    (
      await request(server())
        .get(`/projects/${projectId}/report`)
        .set('Authorization', auth(bearer))
        .expect(200)
    ).body;

  /** A project with something of everything. */
  async function busy() {
    const { id, name } = await project();
    await make(id, 'F-1', 'Ship the importer', { completedAt: daysAgo(1) });
    await make(id, 'F-2', 'Fix the login', { completedAt: daysAgo(3) });
    await make(id, 'F-0', 'Finished long ago', { completedAt: daysAgo(20) });
    await make(id, 'N-1', 'Created this week', { createdAt: daysAgo(2) });
    await make(id, 'D-1', 'In development and nobody’s', {
      status: TaskStatus.EN_DESARROLLO,
      rawOwner: null,
      statusChangedAt: new Date(),
    });
    await make(id, 'A-1', 'Assigned, not started', {
      status: TaskStatus.ASIGNADA,
      assigneeActorId: demoActorId,
    });
    await make(id, 'B-1', 'Blocked on legal', {
      roadmapTable: 'BLOCKED',
      blockedSince: daysAgo(4),
    });
    await make(id, 'O-1', 'Past its date', { dueDate: daysAgo(2) });
    return { id, name };
  }

  it('is a week ending now, and gives the Markdown', async () => {
    const { id } = await busy();

    const data = await report(id);

    expect([
      Date.parse(data.to) - Date.parse(data.from),
      typeof data.markdown,
      data.generatedAt === data.to,
    ]).toEqual([7 * DAY, 'string', true]);
  });

  it('has the title with the name of the project and a section for each of the parts', async () => {
    const { id, name } = await busy();

    const { markdown } = await report(id);

    expect([
      markdown.split('\n')[0],
      markdown.split('\n').filter((line) => line.startsWith('## ')),
    ]).toEqual([
      `# Informe de estado: ${name}`,
      [
        '## Resumen',
        '## Qué se terminó',
        '## Ritmo y pronóstico',
        '## Qué espera',
        '## Riesgos',
        '## En desarrollo',
        '## Lo siguiente',
      ],
    ]);
  });

  it('says what finished this week, and not what finished before', async () => {
    const { id } = await busy();

    const { markdown } = await report(id);

    expect([
      markdown.includes('- F-1 Ship the importer ('),
      markdown.includes('- F-2 Fix the login ('),
      markdown.includes('Finished long ago'),
      markdown.includes('- Terminadas esta semana: 2.'),
    ]).toEqual([true, true, false, true]);
  });

  it('counts what was created this week', async () => {
    const { id } = await busy();

    expect((await report(id)).markdown).toContain('Creadas: 1.');
  });

  it('says the progress now in tasks done of all', async () => {
    const { id } = await busy();

    expect((await report(id)).markdown).toContain(
      '(3 de 8 tareas terminadas).',
    );
  });

  it('compares with the snapshot of seven days ago when there is one', async () => {
    const { id } = await busy();
    await snapshots.recordDay(daysAgo(7), [id]);

    const { markdown } = await report(id);

    expect(markdown).toMatch(
      /- Hace 7 días \(\d{4}-\d{2}-\d{2}\): \d+ de \d+ tareas terminadas/,
    );
  });

  it('says there is no history to compare with when there is no snapshot, not a zero', async () => {
    const { id } = await busy();

    const { markdown } = await report(id);

    expect([
      markdown.includes('- No hay historia de hace 7 días para comparar.'),
      markdown.includes('Hace 7 días'),
    ]).toEqual([true, false]);
  });

  it('says a rebuilt day a week ago is approximate', async () => {
    const { id } = await busy();
    await prisma.project.update({
      where: { id },
      data: { createdAt: daysAgo(40) },
    });
    await request(server())
      .post(`/projects/${id}/snapshots/reconstruct?days=10`)
      .set('Authorization', auth())
      .expect(200);

    expect((await report(id)).markdown).toContain(
      '(aproximado: reconstruido de las fechas de las tareas)',
    );
  });

  it('lists what is waiting, what is in development and what is next', async () => {
    const { id } = await busy();

    const { markdown } = await report(id);

    expect([
      markdown.includes('Bloqueada: B-1 Blocked on legal (desde el '),
      markdown.includes('- D-1 In development and nobody’s'),
      markdown.includes('## Lo siguiente\n\n- A-1 Assigned, not started'),
    ]).toEqual([true, true, true]);
  });

  it('says the risks: the light, and a signal for the task past its date and the one nobody holds', async () => {
    const { id } = await busy();

    const { markdown } = await report(id);

    expect([
      markdown.includes('Semáforo: Rojo.'),
      markdown.includes(
        '- O-1 Past its date: Fuera de plazo (debía estar terminada el ',
      ),
      markdown.includes(
        '- D-1 In development and nobody’s: En desarrollo y sin responsable',
      ),
    ]).toEqual([true, true, true]);
  });

  it('says a project with no tasks has nothing to report', async () => {
    const { id } = await project();

    const { markdown } = await report(id);

    expect(markdown).toContain(
      'El proyecto no tiene tareas todavía: no hay nada que informar.',
    );
  });

  it('escapes the markup of a title and leaves no raw HTML', async () => {
    const { id } = await project();
    await make(id, 'X-1', '# Ship <b>it</b> [now](http://x)', {
      completedAt: daysAgo(1),
    });

    const { markdown } = await report(id);

    expect([
      markdown.includes(
        '- X-1 \\# Ship \\<b\\>it\\</b\\> \\[now\\](http://x) (',
      ),
      /(^|[^\\])<[a-z/]/i.test(markdown),
    ]).toEqual([true, false]);
  });

  it('does not count the deleted tasks nor the cards that are not work', async () => {
    const { id } = await project();
    await make(id, 'W-1', 'Real work', { completedAt: daysAgo(1) });
    await make(id, 'G-1', 'Deleted', {
      completedAt: daysAgo(1),
      deletedAt: new Date(),
    });
    await make(id, 'E-1', 'An epic card', {
      completedAt: daysAgo(1),
      entryType: 'EPIC',
    });

    const { markdown } = await report(id);

    expect([
      markdown.includes('Deleted'),
      markdown.includes('An epic card'),
      markdown.includes('(1 de 1 tareas terminadas)'),
    ]).toEqual([false, false, true]);
  });

  it('is refused to someone who is not a member of the project', async () => {
    const { id } = await project();
    const email = `${unique('outsider')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Outsider', email, password: 'password123' })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(server())
      .get(`/projects/${id}/report`)
      .set('Authorization', auth(login.body.accessToken))
      .expect(403);
  });
});
