import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects login with a wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: 'not-the-real-password' })
      .expect(401);
  });

  it('logs in with the seeded demo credentials and returns a token pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a protected route with no token', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('allows a protected route with a valid access token, and /auth/me matches the demo actor', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    const { accessToken } = login.body;

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(DEMO_EMAIL);
    expect(me.body.kind).toBe('HUMAN');
  });

  it('rejects a refresh token used directly as an access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${login.body.refreshToken}`)
      .expect(401);
  });

  it('issues a new working access token via /auth/refresh', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(typeof refreshed.body.accessToken).toBe('string');

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
  });
});
