import process from 'node:process'
import { z } from 'zod'

// Minimal t3-env replacement — Zod-only, server-only

type ServerSchema = Record<string, z.ZodType>

type InferOutput<T extends ServerSchema> = {
  [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : never
}

interface EnvIssue {
  message: string
  path: Array<string | number>
}

interface CreateEnvOptions<TServer extends ServerSchema> {
  server: TServer
  runtimeEnv?: Record<string, string | undefined>
  emptyStringAsUndefined?: boolean
  skipValidation?: boolean
  onValidationError?: (issues: readonly EnvIssue[]) => never
}

export function createEnv<TServer extends ServerSchema>(opts: CreateEnvOptions<TServer>): InferOutput<TServer> {
  const runtimeEnv = opts.runtimeEnv ?? process.env

  if (opts.emptyStringAsUndefined) {
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (value === '') {
        delete (runtimeEnv as Record<string, unknown>)[key]
      }
    }
  }

  if (opts.skipValidation) {
    return runtimeEnv as InferOutput<TServer>
  }

  const result: Record<string, unknown> = {}
  const issues: EnvIssue[] = []

  for (const [key, schema] of Object.entries(opts.server)) {
    try {
      result[key] = schema.parse(runtimeEnv[key])
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          issues.push({
            message: issue.message,
            path: [key, ...issue.path.map(String)],
          })
        }
      } else {
        issues.push({
          message: String(error),
          path: [key],
        })
      }
    }
  }

  if (issues.length > 0) {
    const onValidationError =
      opts.onValidationError ??
      ((issues): never => {
        process.stderr.write(`❌ Invalid environment variables: ${JSON.stringify(issues)}\n`)
        throw new Error('Invalid environment variables')
      })
    return onValidationError(issues)
  }

  return result as InferOutput<TServer>
}

// Project environment schema

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

    // Session cookie signing. Minimum 32 characters to prevent trivial
    // brute-force forgery of signed session cookies.
    // Comma-separated list for secret rotation: the first secret is used
    // for signing; all secrets are tried (in order) for verification.
    SESSION_SECRET: z
      .string()
      .min(32)
      .transform((val) => val.split(',').map((s) => s.trim())),

    // AES-256-GCM key for encrypting secrets stored in the DB (API keys,
    // S3 credentials). Generate with: openssl rand -hex 32
    ENCRYPTION_KEY: z.string().min(16),

    // Root data directory. All filesystem data (fonts, dead-letter files,
    // MaxMind DB) lives in fixed subdirectories under this path.
    // Required. Use `/data` in Docker, `./data` in local development.
    DATA_PATH: z.string().min(1),

    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),

    // Canvas fallback font path. When set and the /data/fonts/ directory
    // is empty (e.g. bind-mounted), the file is copied at startup as the
    // default OG / calendar font. The Docker image ships with font-noto-cjk.
    DEFAULT_FONT_PATH: z.string().min(1).optional(),

    // Optional prefix added to every Redis key by ioredis.
    // Primarily used in tests to isolate parallel workers.
    REDIS_KEY_PREFIX: z.string().min(1).optional(),
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
  DEFAULT_FONT_PATH,
  DATABASE_URL,
  DB_POOL_MAX,
  DB_STATEMENT_TIMEOUT_MS,
  ENCRYPTION_KEY,
  HOST,
  DATA_PATH,
  LOG_LEVEL,
  NODE_ENV,
  PORT,
  REDIS_KEY_PREFIX,
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
