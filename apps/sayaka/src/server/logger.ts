import pino from 'pino'

function resolveLevel(): string {
  if (import.meta.env.MODE === 'test') {
    return 'silent'
  }
  return import.meta.env.DEV ? 'debug' : 'info'
}

export const rootLogger = pino({
  level: resolveLevel(),
  formatters: {
    level(label: string) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  fatal(message: string, context?: LogContext): void
}

export function getLogger(scope: string): Logger {
  const scoped = rootLogger.child({ scope })
  return {
    debug: (message, context) => scoped.debug(context ?? {}, message),
    info: (message, context) => scoped.info(context ?? {}, message),
    warn: (message, context) => scoped.warn(context ?? {}, message),
    error: (message, context) => scoped.error(context ?? {}, message),
    fatal: (message, context) => scoped.fatal(context ?? {}, message),
  }
}
