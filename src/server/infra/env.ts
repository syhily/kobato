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

    // Session cookie signing.
    SESSION_SECRET: z.string().min(1),

    // Filesystem path to the MaxMind GeoLite2-City mmdb. Optional.
    MAXMIND_DB_PATH: z.string().min(1).optional(),
    // Flip to `true` on dev environments where you want
    // to see your own visits land in the table during analytics work.
    ANALYTICS_TRACK_ADMIN: z
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
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      [
        'Please ensure the following variables are correctly set in your .env file:',
        '',
        '    DATABASE_URL   — PostgreSQL connection URL',
        '    REDIS_URL      — Redis connection URL',
        '    SESSION_SECRET — Session signing secret',
      ].join('\n'),
    )
    process.exit(1)
  }
}

const env = loadEnv()

export const {
  ANALYTICS_TRACK_ADMIN,
  DATABASE_URL,
  HOST,
  LOG_LEVEL,
  MAXMIND_DB_PATH,
  PORT,
  REDIS_URL,
  SESSION_SECRET,
} = env
