import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

/**
 * Login told an attacker which accounts exist and which are switched off, and
 * nobody could change their own password (Roadmap SECURITY-04a).
 */
describe('Login and password change (e2e, Roadmap SECURITY-04a)', () => {
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

  async function createUser(password = 'first-password-1') {
    const email = `hardening-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ displayName: 'Hardening tester', email, password })
      .expect(201);
    return { id: created.body.id as string, email, password };
  }

  const login = (email: string, password: string) =>
    request(server()).post('/auth/login').send({ email, password });

  it('answers the same 401 for an unknown account, a wrong password and a switched-off account', async () => {
    const user = await createUser();
    await request(server())
      .patch(`/users/${user.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false })
      .expect(200);

    const unknown = await login(
      `nobody-${Date.now()}@pmhybrid.local`,
      'whatever-123',
    ).expect(401);
    const wrong = await login(DEMO_EMAIL, 'not-the-password').expect(401);
    // The right password of a switched-off account is not told apart from the rest.
    const inactive = await login(user.email, user.password).expect(401);

    for (const res of [unknown, wrong, inactive]) {
      expect(res.body.message).toBe('Invalid credentials');
    }
  });

  it('changes the caller’s own password: the old one stops working and the new one signs in', async () => {
    const user = await createUser();
    const token = (await login(user.email, user.password).expect(200)).body
      .accessToken;

    await request(server())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: user.password,
        newPassword: 'second-password-2',
      })
      .expect(204);

    await login(user.email, user.password).expect(401);
    await login(user.email, 'second-password-2').expect(200);
  });

  it('refuses a wrong current password with a 400 (not a 401, which would sign the person out), and changes nothing', async () => {
    const user = await createUser();
    const token = (await login(user.email, user.password).expect(200)).body
      .accessToken;

    const res = await request(server())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'not-my-password',
        newPassword: 'second-password-2',
      })
      .expect(400);

    expect(res.body.message).toBe('The current password is incorrect');
    await login(user.email, user.password).expect(200);
  });

  it('refuses a new password that is too short, too long or unchanged', async () => {
    const user = await createUser();
    const token = (await login(user.email, user.password).expect(200)).body
      .accessToken;
    const change = (currentPassword: string, newPassword: string) =>
      request(server())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword, newPassword });

    await change(user.password, 'short').expect(400);
    await change(user.password, 'p'.repeat(129)).expect(400);
    await change(user.password, user.password).expect(400);
    await login(user.email, user.password).expect(200);
  });

  it('needs a signed-in caller', async () => {
    await request(server())
      .post('/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'b'.repeat(8) })
      .expect(401);
  });
});
