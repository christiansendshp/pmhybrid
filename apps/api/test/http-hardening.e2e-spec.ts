import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { applyHttpHardening } from './../src/security/http-hardening.js';

/**
 * The API answered with X-Powered-By and no security headers, and let every
 * website's script call it (Roadmap SECURITY-04b1).
 */
describe('HTTP hardening (e2e, Roadmap SECURITY-04b1)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    applyHttpHardening(app, { corsOrigins: ['https://pm.example.com'] });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('does not say what it runs on, and sends the security headers', async () => {
    const res = await request(server()).get('/health').expect(200);

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('answers an allowed origin with CORS headers and a preflight with what it may send', async () => {
    const res = await request(server())
      .get('/health')
      .set('Origin', 'https://pm.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://pm.example.com',
    );

    const preflight = await request(server())
      .options('/projects/p1/tasks')
      .set('Origin', 'https://pm.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,idempotency-key')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://pm.example.com',
    );
    expect(preflight.headers['access-control-allow-headers']).toMatch(
      /idempotency-key/i,
    );
  });

  it('gives another website no CORS headers, so its browser blocks the answer', async () => {
    const res = await request(server())
      .get('/health')
      .set('Origin', 'https://evil.example.org')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never affects a caller that is not a browser (no Origin header)', async () => {
    await request(server()).get('/health').expect(200);
  });
});
