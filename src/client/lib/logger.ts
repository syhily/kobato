import pino from 'pino'

interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  child(extra: LogContext): Logger
  withScope(scope: string): Logger
}

const root = pino({
  level: import.meta.env.PROD ? 'info' : 'debug',
  browser: {
    asObject: true,
  },
})

function makeLogger(scope: string, base: LogContext = {}): Logger {
  const child = root.child({ scope, ...base })

  return {
    debug: (msg, ctx) => child.debug(ctx ?? {}, msg),
    info: (msg, ctx) => child.info(ctx ?? {}, msg),
    warn: (msg, ctx) => child.warn(ctx ?? {}, msg),
    error: (msg, ctx) => child.error(ctx ?? {}, msg),
    child: (extra) => makeLogger(scope, { ...base, ...extra }),
    withScope: (newScope) => makeLogger(newScope, base),
  }
}

export const logger: Logger = makeLogger('app')

export function getLogger(scope: string): Logger {
  return logger.withScope(scope)
}
