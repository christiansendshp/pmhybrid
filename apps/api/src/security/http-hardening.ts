import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/** The web app's own dev origins: what a laptop needs and nothing more. */
export const DEV_CORS_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
];

/**
 * Which browser origins may call the API (Roadmap SECURITY-04b1). `CORS_ORIGINS`
 * is a comma-separated list; `*` opts in to every origin, on purpose. Unset,
 * development gets the web app's own dev origins and production gets none —
 * a deployment names the origin it serves the web app from, or the browser
 * blocks the calls (a request without an Origin header, from a script or an
 * agent, is never affected by this).
 */
export function parseCorsOrigins(
  raw: string | undefined,
  production: boolean,
): string[] {
  if (raw === undefined || raw.trim() === '') {
    return production ? [] : [...DEV_CORS_ORIGINS];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

/** Whether a request from `origin` gets CORS headers. No Origin header means not a browser, so nothing to decide. */
export function isOriginAllowed(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) {
    return true;
  }
  return allowed.includes('*') || allowed.includes(origin);
}

/**
 * Security headers and the CORS rule, in one place `main.ts` and the e2e suite
 * both call: `helmet` (no `X-Powered-By`, `nosniff`, a locked-down default
 * policy — this API only serves JSON) and an origin allowlist instead of
 * `enableCors()`'s "everyone".
 */
export function applyHttpHardening(
  app: INestApplication,
  options: { corsOrigins: readonly string[] },
): void {
  app.use(helmet());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, isOriginAllowed(origin, options.corsOrigins)),
  });
}
