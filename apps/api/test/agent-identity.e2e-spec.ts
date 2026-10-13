import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

interface Agent {
  id: string;
  displayName: string;
  agentProfile: {
    providerType: string;
    configJson: unknown;
    model: string | null;
    stageRole: string;
    ledgerName: string;
    customLedgerName: boolean;
    aliases: string[];
  };
}

describe('Agent identity: ledger name, aliases, model and stage role (Roadmap TASK-01 — e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
  const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const create = (body: Record<string, unknown> = {}) =>
    request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Agent'), providerType: 'custom', ...body });

  const patch = (id: string, body: Record<string, unknown>, token = adminToken) =>
    request(server()).patch(`/agents/${id}`).set('Authorization', auth(token)).send(body);

  async function createOk(body: Record<string, unknown> = {}): Promise<Agent> {
    const res = await create(body).expect(201);
    return res.body as Agent;
  }

  it('gives an agent that sets nothing the display name as its ledger name, no aliases and both stage roles', async () => {
    const agent = await createOk();

    expect(agent.agentProfile).toMatchObject({
      providerType: 'custom',
      model: null,
      stageRole: 'BOTH',
      ledgerName: agent.displayName,
      customLedgerName: false,
      aliases: [],
    });
  });

  it('stores a ledger name, aliases, a model and a stage role, and lists them', async () => {
    const ledgerName = unique('claude-sonnet-5-5');
    const alias = unique('claude');
    const agent = await createOk({
      ledgerName,
      aliases: [alias, `${alias}-code`],
      model: 'Claude Sonnet 5.5',
      stageRole: 'QA',
    });

    expect(agent.agentProfile).toMatchObject({
      ledgerName,
      customLedgerName: true,
      aliases: [alias, `${alias}-code`],
      model: 'Claude Sonnet 5.5',
      stageRole: 'QA',
    });
    const listed = await request(server()).get('/agents').set('Authorization', auth()).expect(200);
    const found = (listed.body as Agent[]).find((candidate) => candidate.id === agent.id);
    expect(found?.agentProfile.aliases).toEqual([alias, `${alias}-code`]);
  });

  it('refuses a name another agent already answers to, whatever its case or spacing, and never says whose it is', async () => {
    const taken = unique('shared-name');
    const first = await createOk({ aliases: [taken] });

    const sameAlias = await create({ aliases: [`  ${taken.toUpperCase()}  `] }).expect(409);
    const asLedgerName = await create({ ledgerName: taken }).expect(409);
    const asDisplayName = await create({ ledgerName: first.displayName }).expect(409);

    for (const res of [sameAlias, asLedgerName, asDisplayName]) {
      expect(res.body.message).toBe('That ledger name or alias is already used by another agent');
      expect(JSON.stringify(res.body)).not.toContain(first.id);
    }
  });

  it('refuses a display name that another agent already answers to as an alias', async () => {
    const alias = unique('answers-to');
    await createOk({ aliases: [alias] });

    await create({ displayName: alias }).expect(409);
    const other = await createOk();
    await patch(other.id, { displayName: alias.toUpperCase() }).expect(409);
  });

  it('lets an agent keep its own names across an update and drops a repeat of its ledger name from the aliases', async () => {
    const ledgerName = unique('ledger');
    const agent = await createOk({ ledgerName, aliases: [unique('a')] });

    const updated = await patch(agent.id, {
      ledgerName,
      aliases: [ledgerName.toUpperCase(), `${ledgerName}-2`, `${ledgerName}-2`],
    }).expect(200);

    expect((updated.body as Agent).agentProfile.aliases).toEqual([`${ledgerName}-2`]);
  });

  it('replaces the aliases when sent, keeps them when not, and goes back to the display name on a null ledger name', async () => {
    const agent = await createOk({ ledgerName: unique('x'), aliases: [unique('one')] });

    const renamed = await patch(agent.id, { model: 'another model' }).expect(200);
    expect((renamed.body as Agent).agentProfile.aliases).toHaveLength(1);

    const cleared = await patch(agent.id, { ledgerName: null, aliases: [], model: null }).expect(200);
    expect((cleared.body as Agent).agentProfile).toMatchObject({
      ledgerName: agent.displayName,
      customLedgerName: false,
      aliases: [],
      model: null,
    });
  });

  it('refuses what the ledger header cannot hold and what looks like a credential, without echoing it', async () => {
    const credential = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV';

    await create({ ledgerName: 'a | b' }).expect(400);
    await create({ aliases: ['two\nlines'] }).expect(400);
    await create({ aliases: [unique('ok'), 'x'.repeat(101)] }).expect(400);
    await create({ aliases: Array.from({ length: 21 }, (_, i) => unique(`many${i}`)) }).expect(400);
    await create({ stageRole: 'ADMIN' }).expect(400);

    const refused = await create({ aliases: [credential] }).expect(400);
    expect(JSON.stringify(refused.body)).not.toContain(credential);
    expect(refused.body.message).toMatch(/credential/);
    const ledger = await create({ ledgerName: credential }).expect(400);
    expect(JSON.stringify(ledger.body)).not.toContain(credential);
  });

  it('is changed only by someone who holds actors.manage', async () => {
    const agent = await createOk();
    const email = `${unique('member')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Plain member', email, password: 'password123' })
      .expect(201);
    const login = await request(server()).post('/auth/login').send({ email, password: 'password123' }).expect(200);
    const memberToken = login.body.accessToken as string;

    await patch(agent.id, { aliases: [unique('nope')] }, memberToken).expect(403);
    await request(server())
      .post('/agents')
      .set('Authorization', auth(memberToken))
      .send({ displayName: unique('Agent'), providerType: 'custom', aliases: [unique('nope')] })
      .expect(403);
    // Anyone signed in may still read them.
    await request(server()).get(`/agents/${agent.id}`).set('Authorization', auth(memberToken)).expect(200);
  });

  it('audits what changed, the aliases included, and records nothing for an update that changes nothing', async () => {
    const alias = unique('audited');
    const agent = await createOk({ aliases: [alias] });
    const eventsBefore = await prisma.auditEvent.count({ where: { entityType: 'Actor', entityId: agent.id } });

    await patch(agent.id, { aliases: [alias] }).expect(200);
    expect(await prisma.auditEvent.count({ where: { entityType: 'Actor', entityId: agent.id } })).toBe(eventsBefore);

    await patch(agent.id, { aliases: [alias, `${alias}-2`], stageRole: 'DEVELOPER', model: 'm1' }).expect(200);
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: 'Actor', entityId: agent.id, operation: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event.newValue).toMatchObject({ aliases: [alias, `${alias}-2`], stageRole: 'DEVELOPER', model: 'm1' });
    expect(event.previousValue).toMatchObject({ aliases: [alias], stageRole: 'BOTH', model: null });
  });

  it('keeps an existing agent working: the profile it had still reads, with the new fields at their defaults', async () => {
    const legacy = await prisma.actor.create({
      data: {
        kind: 'AI_AGENT',
        displayName: unique('Legacy agent'),
        agentProfile: { create: { providerType: 'codex', configJson: { temperature: 0.2 } } },
      },
    });

    const res = await request(server()).get(`/agents/${legacy.id}`).set('Authorization', auth()).expect(200);

    expect((res.body as Agent).agentProfile).toMatchObject({
      providerType: 'codex',
      configJson: { temperature: 0.2 },
      model: null,
      stageRole: 'BOTH',
      aliases: [],
      customLedgerName: false,
    });
  });
});
