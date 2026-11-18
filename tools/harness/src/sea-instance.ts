// Lifecycle for driving a built SEA binary as an HTTP instance: boot with
// output captured to a log file, poll /health until the first response, and
// stop with a bounded SIGTERM/SIGKILL race. Used by the pack smoke/e2e
// orchestrators and the browser journey runner.

import type { ChildProcess } from 'node:child_process'
import type { WriteStream } from 'node:fs'

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { ExitOutcome, ExitState } from './process.ts'
import type { TempDirs } from './temp.ts'

import { fail, fetchManual, pickFreePort, raceChildExit, scrubbedParentEnv, sleep, watchChildExit } from './process.ts'

export const BOOT_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 500

export interface SmokeServer {
  child: ChildProcess
  exitState: ExitState
  port: number
  logStream: WriteStream
  logClosed: Promise<void>
  healthResponse: Response | null
}

export async function ensureBinaryExists(binaryPath: string): Promise<void> {
  try {
    await stat(binaryPath)
  } catch {
    fail(`SEA binary not found at ${binaryPath}. Run pnpm run sea:build first (or pass the binary path).`)
  }
}

/**
 * Spawn the server with an unrelated cwd, output captured to `logPath`
 * (truncated per boot). Natives extraction, migrations, and the listener
 * all happen before the first response.
 */
export async function bootServer(
  binaryPath: string,
  dirs: TempDirs,
  env: Record<string, string>,
  logPath: string,
): Promise<SmokeServer> {
  const port = await pickFreePort()
  const logStream = createWriteStream(logPath, { flags: 'w' })
  const logClosed = new Promise<void>((resolve) => logStream.once('close', resolve))
  // The config file MUST live inside the per-run temp root (never next to
  // the binary or ~/.config), and config vars must NOT come from the parent
  // env — a leaked value silently overrides the converged file (env > file).
  const parentEnv = scrubbedParentEnv()
  const child = spawn(binaryPath, ['--config', join(dirs.root, 'kobato.config.json')], {
    cwd: dirs.cwd,
    env: { ...parentEnv, ...env, server__port: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  const exitState = watchChildExit(child)
  return { child, exitState, port, logStream, logClosed, healthResponse: null }
}

/** Poll until the server answers with ANY HTTP status (or fails boot). */
export async function waitForHttp(url: string, exitState: ExitState): Promise<Response> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let lastError = 'no attempt completed'
  while (Date.now() < deadline) {
    if (exitState.exited) {
      throw new Error(
        `server exited during boot (code ${exitState.code ?? 'null'}, signal ${exitState.signal ?? 'none'})`,
      )
    }
    try {
      return await fetchManual(url)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await sleep(POLL_INTERVAL_MS)
    }
  }
  throw new Error(`no HTTP response within ${BOOT_TIMEOUT_MS / 1000}s (last error: ${lastError})`)
}

export function waitForExit(server: SmokeServer, timeoutMs: number): Promise<ExitOutcome> {
  return raceChildExit(server.child, server.exitState, timeoutMs)
}
