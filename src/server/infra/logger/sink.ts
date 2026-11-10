// SDK-free log sink seam. The Pino Writable in ../logger.ts forwards every
// serialized line here; the trace runtime installs the sink while the
// `observability.logs.enabled` setting is active. Zero imports by design —
// this module must stay loadable before any SDK exists.

export interface LogSink {
  push(line: string): void
}

let sink: LogSink | null = null
// Synchronous re-entry fence: a sink that logs through the logger re-enters
// itself, which would recurse without bound. Re-entrant lines are dropped.
let inFlight = false

/** Install the sink into the process-wide empty slot. Build-independent. */
export function setLogSink(next: LogSink): boolean {
  if (sink !== null) {
    return false
  }
  sink = next
  return true
}

/** Clear the sink, but only when `expected` is the installed one. */
export function clearLogSink(expected: LogSink): boolean {
  if (sink === null || sink !== expected) {
    return false
  }
  sink = null
  return true
}

/** Forward one serialized log line. Never throws into the caller. */
export function pushLogLine(line: string): void {
  const active = sink
  if (active === null || inFlight) {
    return
  }
  inFlight = true
  try {
    active.push(line)
  } catch {
    // A failing sink is isolated: stdout and the logger are unaffected.
  } finally {
    inFlight = false
  }
}

/** Test-only: restore the module slots. */
export function __resetLogSinkForTests(): void {
  sink = null
  inFlight = false
}
