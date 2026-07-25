import process from 'node:process'
import { z } from 'zod'

import { CONFIG_TABLE, loadConfig, type TableServerSchema } from '@/server/infra/config'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Minimal t3-env replacement — Zod-only, server-only
//
// Configuration sources (lowest → highest precedence):
//   1. schema defaults
//   2. the config file `kobato.config.json` (always present — auto-created;
//      env overrides are written back into it, see `@/server/infra/config`)
//   3. process env vars, named by Ghost's `__` convention:
//      `database__url` overrides `database.url`, etc. The validated TS
//      export names below (`env.DATABASE_URL`, …) are unchanged; only the
//      process-level variable names follow the nested convention.

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
  runtimeEnv?: Record<string, unknown>
  emptyStringAsUndefined?: boolean
  skipValidation?: boolean
  onValidationError?: (issues: readonly EnvIssue[]) => never
}

export function createEnv<TServer extends ServerSchema>(opts: CreateEnvOptions<TServer>): InferOutput<TServer> {
  const runtimeEnv = opts.runtimeEnv ?? process.env

  if (opts.emptyStringAsUndefined) {
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (value === '') {
        delete unsafeCast<Record<string, unknown>>(runtimeEnv)[key]
      }
    }
  }

  if (opts.skipValidation) {
    return unsafeCast<InferOutput<TServer>>(runtimeEnv)
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

  return unsafeCast<InferOutput<TServer>>(result)
}

// Project environment schema — built from CONFIG_TABLE (the single source
// of truth in `@/server/infra/config`). NODE_ENV stays process-env-only:
// it selects the process mode, not a deployment setting.

const envConfig = {
  server: {
    ...unsafeCast<TableServerSchema>(Object.fromEntries(CONFIG_TABLE.map((entry) => [entry.export, entry.schema]))),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('production'),
  },
  emptyStringAsUndefined: true,
}

function loadEnv() {
  try {
    const runtimeEnv = { ...loadConfig(), NODE_ENV: process.env.NODE_ENV }
    return createEnv({ ...envConfig, runtimeEnv })
  } catch (error) {
    // Bootstrap-phase fallback: logger is not yet available because it
    // depends on env itself. Use stderr directly for the fatal message.
    process.stderr.write(
      [
        'Environment validation failed:',
        String(error),
        '',
        'Please ensure the following values are set in kobato.config.json',
        '(or passed as `__`-style environment variables):',
        '',
        '    database.url             — PostgreSQL connection URL',
        '    security.sessionSecret   — Session signing secret',
        '    security.encryptionKey   - The encryption key for sensitive content',
        '    storage.data             - Root directory for all local filesystem data',
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
  RESTORE_ROLE,
  SESSION_SECRET,
} = env

export function isVitest(): boolean {
  return process.env.VITEST === 'true'
}

/** Full `process.env` snapshot (undefined values filtered) for child-process spawning (e.g. pg_dump). */
export const processEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
