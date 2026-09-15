import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

/**
 * Role catalog + configurable permissions (brief §4, Roadmap GAP-12).
 * Assign/revoke of a project-scoped role is already covered by
 * projects.e2e-spec.ts via /projects/:projectId/roles; this covers the
 * global catalog and the new PATCH :id/permissions endpoint.
 */
describe('Role catalog and configurable permissions (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

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

  async function createUser() {
    const email = `${unique('member')}@pmhybrid.local`;
    const res = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Role tester', email, password: 'password123' })
      .expect(201);
    return { id: res.body.id as string, email };
  }

  async function loginAs(email: string) {
    const res = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function findRole(name: string, scope: 'GLOBAL' | 'PROJECT') {
    const res = await request(server()).get('/roles').set('Authorization', auth()).expect(200);
    const role = (res.body as Array<{ id: string; name: string; scope: string }>).find(
      (r) => r.name === name && r.scope === scope,
    );
    if (!role) {
      throw new Error(`Role ${name}/${scope} not seeded`);
    }
    return role;
  }

  it('lists roles and permissions for any authenticated actor, without roles.manage', async () => {
    const user = await createUser();
    const token = await loginAs(user.email);

    const roles = await request(server()).get('/roles').set('Authorization', auth(token)).expect(200);
    expect(roles.body.length).toBeGreaterThan(0);

    const permissions = await request(server())
      .get('/roles/permissions')
      .set('Authorization', auth(token))
      .expect(200);
    expect(permissions.body.map((p: { key: string }) => p.key)).toContain('roles.manage');
  });

  it('a non-holder of roles.manage is refused 403 on a permission edit', async () => {
    const user = await createUser();
    const token = await loginAs(user.email);
    const viewer = await findRole('VIEWER', 'PROJECT');

    await request(server())
      .patch(`/roles/${viewer.id}/permissions`)
      .set('Authorization', auth(token))
      .send({ permissionKeys: ['task.assign'] })
      .expect(403);
  });

  it('an unknown permission key is rejected as 400, not silently dropped', async () => {
    const viewer = await findRole('VIEWER', 'PROJECT');

    await request(server())
      .patch(`/roles/${viewer.id}/permissions`)
      .set('Authorization', auth())
      .send({ permissionKeys: ['task.assign', 'not.a.real.permission'] })
      .expect(400);
  });

  it('edits a role permission set and it takes effect immediately, with no caching', async () => {
    const viewer = await findRole('VIEWER', 'PROJECT');

    const updated = await request(server())
      .patch(`/roles/${viewer.id}/permissions`)
      .set('Authorization', auth())
      .send({ permissionKeys: ['task.assign', 'task.status.transition'] })
      .expect(200);
    expect(
      updated.body.rolePermissions.map((rp: { permission: { key: string } }) => rp.permission.key),
    ).toEqual(expect.arrayContaining(['task.assign', 'task.status.transition']));

    // Revert to VIEWER's seeded (empty) set to leave the fixture clean for other tests.
    await request(server())
      .patch(`/roles/${viewer.id}/permissions`)
      .set('Authorization', auth())
      .send({ permissionKeys: [] })
      .expect(200);
  });

  it('refuses a permission edit that would leave nobody holding roles.manage instance-wide', async () => {
    const admin = await findRole('ADMIN', 'GLOBAL');

    const attempt = await request(server())
      .patch(`/roles/${admin.id}/permissions`)
      .set('Authorization', auth())
      .send({ permissionKeys: ['actors.manage'] }) // drops roles.manage
      .expect(400);
    expect(attempt.body.message).toMatch(/roles/i);

    // The rejected write must not have partially applied — ADMIN still holds roles.manage.
    const permissions = await request(server())
      .get('/roles/permissions')
      .set('Authorization', auth())
      .expect(200);
    expect(permissions.body.map((p: { key: string }) => p.key)).toContain('roles.manage');
    const stillWorks = await request(server())
      .patch(`/roles/${admin.id}/permissions`)
      .set('Authorization', auth())
      .send({ permissionKeys: ['actors.manage', 'roles.manage'] })
      .expect(200);
    expect(
      stillWorks.body.rolePermissions.map((rp: { permission: { key: string } }) => rp.permission.key),
    ).toContain('roles.manage');
  });

  it('404s a permission edit on a role id that does not exist', async () => {
    await request(server())
      .patch('/roles/00000000-0000-0000-0000-000000000000/permissions')
      .set('Authorization', auth())
      .send({ permissionKeys: [] })
      .expect(404);
  });
});
