export interface LogSink {
  push(line: string): void
}

let sink: LogSink | null = null
let inFlight = false

export function setLogSink(next: LogSink): boolean {
  if (sink !== null) {
    return false
  }
  sink = next
  return true
}

export function clearLogSink(expected: LogSink): boolean {
  if (sink === null || sink !== expected) {
    return false
  }
  sink = null
  return true
}

export function pushLogLine(line: string): void {
  const active = sink
  if (active === null || inFlight) {
    return
  }
  inFlight = true
  try {
    active.push(line)
  } catch {
  } finally {
    inFlight = false
  }
}

export function __resetLogSinkForTests(): void {
  sink = null
  inFlight = false
}
