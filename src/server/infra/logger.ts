// Structured JSON logger backed by pino. The public API (Logger interface,
// getLogger, logger singleton) is the only stable surface — consumers never
// touch pino directly, so the underlying transport can be swapped without
// touching call sites.
//
// Privacy: known L3 fields (e.g. email, ip, name) are wrapped in {E}…{/E}
// markers per `.agents/skills/privacy-logging/SKILL.md`, so log aggregators can
// strip or hash them before storage. Callers don't need to remember to tag
// values manually — using the standard key names is enough.
//
// Audit log convention: loggers named `audit.<domain>` (e.g. `audit.user`,
// `audit.comment`, `audit.cms.posts`) are for operational visibility only.
// Durable audit records are written via `recordAuditEvent()` to the
// `audit_log` PostgreSQL table through a COPY batcher, not through this
// logger. `getLogger('audit.*')` calls remain informational stdout output.

import { Writable } from 'node:stream'
import pino from 'pino'

import { LOG_LEVEL } from '@/server/infra/env'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type Level = NonNullable<typeof LOG_LEVEL>

function resolveLevel(): Level {
  if (LOG_LEVEL) {
    return LOG_LEVEL
  }
  const meta = unsafeCast<{ env?: { PROD?: boolean } }>(import.meta).env
  return meta?.PROD === true ? 'info' : 'debug'
}

// Privacy tagging — L3 (direct identifier) fields

export const L3_KEYS = new Set([
  'email',
  'ip',
  'clientAddress',
  'remoteAddress',
  'userAgent',
  'phone',
  'authorEmail',
  'authorIp',
  'cookie',
  'deviceId',
  'name',
])

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '[object with circular reference]'
  }
}

function tagL3(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }
  const str = typeof value === 'string' ? value : safeStringify(value)
  return str === '' ? str : `{E}${str}{/E}`
}

// Error serialization — preserves cause chains and extra props

function serializeError(err: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
  }
  if (err.stack) {
    out.stack = err.stack
  }
  const cause = unsafeCast<Error & { cause?: unknown }>(err).cause
  if (cause !== undefined) {
    out.cause = cause instanceof Error ? serializeError(cause) : cause
  }
  for (const [key, value] of Object.entries(err)) {
    if (key in out) {
      continue
    }
    out[key] = value
  }
  return out
}

// Apply privacy tagging to a single element of an array-valued log field.
// Split out so the map callback has a typed return instead of leaking
// `unknown` through the ternary into the outer assignment.
function tagArrayElement(item: unknown, keyIsL3: boolean): unknown {
  if (typeof item === 'object' && item !== null && !(item instanceof Error)) {
    return applyPrivacyTagsRecursive(unsafeCast<LogContext>(item))
  }
  return keyIsL3 ? tagL3(item) : item
}

function applyPrivacyTagsRecursive(context: LogContext): LogContext {
  const tagged: LogContext = {}
  for (const [key, value] of Object.entries(context)) {
    if (value instanceof Error) {
      tagged[key] = serializeError(value)
    } else if (Array.isArray(value)) {
      const keyIsL3 = L3_KEYS.has(key)
      tagged[key] = value.map((item) => tagArrayElement(item, keyIsL3))
    } else if (typeof value === 'object' && value !== null) {
      tagged[key] = applyPrivacyTagsRecursive(unsafeCast<LogContext>(value))
    } else {
      tagged[key] = L3_KEYS.has(key) ? tagL3(value) : value
    }
  }
  return tagged
}

// Pino root instance

interface LogContext {
  [key: string]: unknown
}

// Pino's default destination (SonicBoom) writes directly to the file
// descriptor, which bypasses process.stdout.write — making test spies
// unable to intercept log output. A thin Writable wrapper keeps output
// going to stdout while remaining interceptable in tests.
const stdout = new Writable({
  write(chunk, _encoding, cb) {
    process.stdout.write(String(chunk))
    cb()
  },
})

export const root = pino(
  {
    level: resolveLevel(),
    // Output "info" instead of 30, "warn" instead of 40, etc.
    formatters: {
      level(label: string) {
        return { level: label }
      },
    },
    // ISO-8601 timestamps to match the previous custom logger's format.
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      error: serializeError,
    },
  },
  stdout,
)

// Public Logger interface — unchanged from the custom logger

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  fatal(message: string, context?: LogContext): void
  child(extra: LogContext): Logger
  withScope(scope: string): Logger
}

function makeLogger(scope: string, base: LogContext = {}): Logger {
  const pinoChild = root.child({ scope, ...base })
  const wrap = (ctx?: LogContext): Record<string, unknown> => (ctx ? applyPrivacyTagsRecursive(ctx) : {})

  return {
    debug: (msg, ctx) => pinoChild.debug(wrap(ctx), msg),
    info: (msg, ctx) => pinoChild.info(wrap(ctx), msg),
    warn: (msg, ctx) => pinoChild.warn(wrap(ctx), msg),
    error: (msg, ctx) => pinoChild.error(wrap(ctx), msg),
    fatal: (msg, ctx) => pinoChild.fatal(wrap(ctx), msg),
    child: (extra) => makeLogger(scope, { ...base, ...extra }),
    withScope: (newScope) => makeLogger(newScope, base),
  }
}

export const logger: Logger = makeLogger('app')

export function getLogger(scope: string): Logger {
  return logger.withScope(scope)
}
