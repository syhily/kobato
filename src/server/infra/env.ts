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
    // Flip to `true` on dev environments where you want
    // to see your own visits land in the table during analytics work.
    ANALYTICS_TRACK_ADMIN: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default(false),
    // Flip to `true` to keep bot rows in the access_log table.
    // Default `false` strips them. Mainly a forensic / debugging affordance.
    ANALYTICS_KEEP_BOT_ROWS: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default(false),
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
  ANALYTICS_KEEP_BOT_ROWS,
  ANALYTICS_TRACK_ADMIN,
  DATABASE_URL,
  DB_POOL_MAX,
  DB_STATEMENT_TIMEOUT_MS,
  ENCRYPTION_KEY,
  HOST,
  LOG_LEVEL,
  MAXMIND_DB_PATH,
  PORT,
  REDIS_URL,
  SESSION_SECRET,
} = env

export function isVitest(): boolean {
  return process.env.VITEST === 'true'
}
