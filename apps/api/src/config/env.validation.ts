export interface EnvConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  PORT: number;
  SYNC_DEFAULT_INTERVAL_MINUTES: number;
  GIT_PROVIDER_TYPE: string;
}

const REQUIRED_KEYS: Array<keyof EnvConfig> = ['DATABASE_URL', 'JWT_SECRET'];

/**
 * Hand-rolled on purpose: a schema-validation library (Joi/Zod) is
 * unnecessary weight for six flat env vars. Revisit if the env surface grows.
 */
export function validateEnv(
  raw: Record<string, string | undefined>,
): EnvConfig {
  const missing = REQUIRED_KEYS.filter((key) => !raw[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return {
    DATABASE_URL: raw.DATABASE_URL!,
    JWT_SECRET: raw.JWT_SECRET!,
    JWT_EXPIRES_IN: raw.JWT_EXPIRES_IN ?? '15m',
    PORT: raw.PORT ? Number(raw.PORT) : 3000,
    SYNC_DEFAULT_INTERVAL_MINUTES: raw.SYNC_DEFAULT_INTERVAL_MINUTES
      ? Number(raw.SYNC_DEFAULT_INTERVAL_MINUTES)
      : 5,
    GIT_PROVIDER_TYPE: raw.GIT_PROVIDER_TYPE ?? 'local',
  };
}
