// Minimal structured logger for the public frontend. The core app's pino
// pipeline stays in the server package (headless boundary); the frontend's
// own lifecycle (boot, /health, SSR errors) logs through this shim. Same
// `info/warn/error` surface, no pino dependency — the SEA smoke only reads
// the log text for diagnostics.

function makeLogger(name: string) {
  const prefix = `[frontend:${name}]`
  return {
    // oxlint-disable-next-line no-console -- this module IS the console facade (see module doc); the core app's pino pipeline stays behind the headless boundary
    info: (message: string, ...rest: unknown[]) => console.info(prefix, message, ...rest),
    warn: (message: string, ...rest: unknown[]) => console.warn(prefix, message, ...rest),
    error: (message: string, ...rest: unknown[]) => console.error(prefix, message, ...rest),
  }
}

export const root = makeLogger('root')

export function getLogger(name: string) {
  return makeLogger(name)
}
