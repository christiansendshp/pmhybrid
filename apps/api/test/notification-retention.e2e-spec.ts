import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { NotificationRetentionService } from './../src/modules/notifications/notification-retention.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

/**
 * A notification read long ago is deleted, an unread one never (Roadmap TASK-51).
 */
describe('Notification retention (e2e, Roadmap TASK-51)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let retention: NotificationRetentionService;
  let token: string;
  let projectId: string;

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
    retention = moduleFixture.get(NotificationRetentionService);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Notification retention E2E-${Date.now()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    projectId = created.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A person of their own, so the run can be limited to them and nobody else's notifications are touched. */
  async function person(): Promise<string> {
    const email = `retention-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`;
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Retention', email, password: 'password123' })
      .expect(201);
    return created.body.id as string;
  }

  const notify = (
    actorId: string,
    data: { createdDaysAgo: number; readDaysAgo: number | null },
  ) =>
    prisma.notification.create({
      data: {
        actorId,
        projectId,
        type: 'TASK_ASSIGNED',
        createdAt: daysAgo(data.createdDaysAgo),
        readAt: data.readDaysAgo === null ? null : daysAgo(data.readDaysAgo),
      },
    });

  const remaining = async (actorId: string) =>
    await prisma.notification.count({ where: { actorId } });

  it('deletes a notification read more than the limit ago', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 200, readDaysAgo: 100 });

    const result = await retention.prune(NOW, {
      days: 90,
      actorIds: [actorId],
    });

    expect([result, await remaining(actorId)]).toEqual([{ deleted: 1 }, 0]);
  });

  it('keeps a notification read within the limit', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 200, readDaysAgo: 10 });

    await retention.prune(NOW, { days: 90, actorIds: [actorId] });

    expect(await remaining(actorId)).toBe(1);
  });

  it('never deletes an unread notification, however old', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 1000, readDaysAgo: null });

    const result = await retention.prune(NOW, {
      days: 90,
      actorIds: [actorId],
    });

    expect([result.deleted, await remaining(actorId)]).toEqual([0, 1]);
  });

  it('counts from when it was read, not from when it was made', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 500, readDaysAgo: 2 });
    await notify(actorId, { createdDaysAgo: 5, readDaysAgo: 4 });

    await retention.prune(NOW, { days: 3, actorIds: [actorId] });

    expect(await remaining(actorId)).toBe(1);
  });

  it('keeps one read exactly at the limit and deletes the one just past it', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 100, readDaysAgo: 30 });
    await notify(actorId, { createdDaysAgo: 100, readDaysAgo: 30.001 });

    const result = await retention.prune(NOW, {
      days: 30,
      actorIds: [actorId],
    });

    expect(result.deleted).toBe(1);
  });

  it('keeps everything when the limit is 0', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 900, readDaysAgo: 800 });

    const result = await retention.prune(NOW, { days: 0, actorIds: [actorId] });

    expect([result, await remaining(actorId)]).toEqual([{ deleted: 0 }, 1]);
  });

  it('leaves alone the people it was not asked about', async () => {
    const named = await person();
    const other = await person();
    await notify(named, { createdDaysAgo: 200, readDaysAgo: 100 });
    await notify(other, { createdDaysAgo: 200, readDaysAgo: 100 });

    await retention.prune(NOW, { days: 90, actorIds: [named] });

    expect([await remaining(named), await remaining(other)]).toEqual([0, 1]);
  });

  it('uses the configured limit when none is given, deleting nothing read within 90 days', async () => {
    const actorId = await person();
    await notify(actorId, { createdDaysAgo: 100, readDaysAgo: 60 });

    const result = await retention.prune(NOW, { actorIds: [actorId] });

    expect(result.deleted).toBe(0);
  });
});
