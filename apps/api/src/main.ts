import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { weakJwtSecretReason } from './config/secret-strength.js';
import {
  applyHttpHardening,
  parseCorsOrigins,
} from './security/http-hardening.js';

/**
 * Without these, a rejected promise nobody awaited (or, on an older Node,
 * an exception nobody caught) took the process down silently — no log line
 * says why, only that it stopped (Roadmap BUG-10). A rejection is logged and
 * left running: most of this app's async work is already inside Nest's own
 * request/job handling, which catches its own; one that still escapes here
 * is a bug to see and fix, not a reason to take the whole server down by
 * itself. An exception past every catch means state next to it may be
 * inconsistent, so that one logs and exits — under a restart policy
 * (`docker-compose.prod.yml`'s `restart: unless-stopped`, `docs/deployment.md`)
 * the process comes back within seconds, with a cause in the log instead of
 * an unexplained gap.
 */
function installProcessErrorHandlers(): void {
  const logger = new Logger('Bootstrap');
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${String(reason)}`);
  });
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception, exiting: ${error.stack ?? error}`);
    process.exit(1);
  });
}

async function bootstrap() {
  installProcessErrorHandlers();
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
