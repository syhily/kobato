import type { ChildProcess } from 'node:child_process'

import { createServer } from 'node:net'

const FETCH_TIMEOUT_MS = 5_000

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('listen returned no port')))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

export async function fetchManual(url: string): Promise<Response> {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

export function scrubbedParentEnv(options: { drop?: string[] } = {}): Record<string, string> {
  const drop = new Set(options.drop ?? [])
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !entry[0].includes('__') && !entry[0].startsWith('KOBATO_') && !drop.has(entry[0]),
    ),
  )
}

export interface ExitState {
  exited: boolean
  code: number | null
  signal: NodeJS.Signals | null
}

export interface ExitOutcome {
  code: number | null
  signal: NodeJS.Signals | null
  timeout: boolean
}

export function watchChildExit(child: ChildProcess): ExitState {
  const exitState: ExitState = { exited: false, code: null, signal: null }
  child.once('exit', (code, signal) => {
    exitState.exited = true
    exitState.code = code
    exitState.signal = signal
  })
  return exitState
}

export async function raceChildExit(
  child: ChildProcess,
  exitState: ExitState,
  timeoutMs: number,
): Promise<ExitOutcome> {
  if (exitState.exited) {
    return { code: exitState.code, signal: exitState.signal, timeout: false }
  }
  const exited = new Promise<ExitOutcome>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal, timeout: false }))
  })
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<ExitOutcome>((resolve) => {
    timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: null, signal: null, timeout: true })
    }, timeoutMs)
  })
  try {
    return await Promise.race([exited, timedOut])
  } finally {
    clearTimeout(timer)
  }
}
