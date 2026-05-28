import { createEnv } from '@t3-oss/env-core'
import process from 'node:process'
import { z } from 'zod'

const envConfig = {
  server: {
    // Default configuration. Normally let it as it is.
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4321),

    // Database
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).optional().default(20),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).optional().default(30_000),

    // Session cookie signing.
    SESSION_SECRET: z.string().min(1),

    // AES-256-GCM key for encrypting secrets stored in the DB (API keys,
    // S3 credentials). Optional: secrets remain plaintext until set.
    ENCRYPTION_KEY: z.string().min(1).optional(),

    // Filesystem path to the MaxMind GeoLite2-City mmdb. Optional.
    MAXMIND_DB_PATH: z.string().min(1).optional(),

    // Filesystem directory containing TTF/OTF fonts for OG image and calendar
    // rendering. Admin settings specify filenames relative to this directory.
    // Optional: when unset, Canvas falls back to its built-in system CJK shaper.
    FONT_PATH: z.string().min(1).optional(),

    // Dead-letter file paths for analytics and audit batchers.
    // Optional: fall back to `/tmp/...` defaults when unset.
    ANALYTICS_DEAD_LETTER_PATH: z.string().min(1).optional(),
    AUDIT_DEAD_LETTER_PATH: z.string().min(1).optional(),

    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
}

function loadEnv() {
  try {
    return createEnv(envConfig)
  } catch (error) {
    // Bootstrap-phase fallback: logger is not yet available because it
    // depends on env itself. Use stderr directly for the fatal message.
    process.stderr.write(
      [
        'Environment validation failed:',
        String(error),
        '',
        'Please ensure the following variables are correctly set in your .env file:',
        '',
        '    DATABASE_URL   — PostgreSQL connection URL',
        '    REDIS_URL      — Redis connection URL',
        '    SESSION_SECRET — Session signing secret',
        '    ENCRYPTION_KEY - The encryption key for sensitive content',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }
}

const env = loadEnv()

export const {
  ANALYTICS_DEAD_LETTER_PATH,
  AUDIT_DEAD_LETTER_PATH,
  DATABASE_URL,
  DB_POOL_MAX,
  DB_STATEMENT_TIMEOUT_MS,
  ENCRYPTION_KEY,
  FONT_PATH,
  HOST,
  LOG_LEVEL,
  MAXMIND_DB_PATH,
  NODE_ENV,
  PORT,
  REDIS_URL,
  SESSION_SECRET,
} = env

export function isVitest(): boolean {
  return process.env.VITEST === 'true'
}

/** Full `process.env` snapshot (undefined values filtered) for child-process spawning (e.g. pg_dump). */
export const processEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined),
) as Record<string, string>
