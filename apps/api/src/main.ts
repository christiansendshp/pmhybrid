import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { weakJwtSecretReason } from './config/secret-strength.js';
import {
  applyHttpHardening,
  parseCorsOrigins,
} from './security/http-hardening.js';

async function bootstrap() {
  // rawBody: true — the GitHub webhook signature (Roadmap GAP-29) is an
  // HMAC over the exact request bytes; Nest exposes them as `req.rawBody`
  // only when this is set, without changing how any other route parses JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const weakSecret = weakJwtSecretReason(process.env.JWT_SECRET ?? '');
  if (weakSecret) {
    // Production refuses to start on this (validateEnv); here it is only a warning.
    new Logger('Security').warn(`JWT_SECRET is weak: ${weakSecret}`);
  }
  applyHttpHardening(app, {
    corsOrigins: parseCorsOrigins(
      process.env.CORS_ORIGINS,
      process.env.NODE_ENV?.toLowerCase() === 'production',
    ),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
