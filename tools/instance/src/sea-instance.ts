import type { ExitOutcome, ExitState } from '@kobato/instance/process'
import type { SmokeDatabases, TempDirs } from '@kobato/instance/temp'
import type { ChildProcess } from 'node:child_process'
import type { WriteStream } from 'node:fs'

import {
  fail,
  fetchManual,
  pickFreePort,
  raceChildExit,
  scrubbedParentEnv,
  sleep,
  watchChildExit,
} from '@kobato/instance/process'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

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

export function seaInstanceEnv(dirs: TempDirs, databases: SmokeDatabases): Record<string, string> {
  return {
    storage__database: databases.database,
    storage__analyticsDatabase: databases.analytics,
    security__sessionSecret: randomBytes(32).toString('hex'),
    security__encryptionKey: randomBytes(32).toString('hex'),
    storage__data: dirs.data,
    KOBATO_CACHE_DIR: dirs.cache,
    NODE_ENV: 'production',
  }
}

export function sayakaInstanceEnv(kobatoOrigin: string, sayakaPort: number): Record<string, string> {
  return {
    SAYAKA_HOST: '127.0.0.1',
    SAYAKA_PORT: String(sayakaPort),
    SAYAKA_KOBATO_RPC_URL: `${kobatoOrigin}/rpc`,
    NODE_ENV: 'production',
  }
}

export async function ensureBinaryExists(binaryPath: string): Promise<void> {
  try {
    await stat(binaryPath)
  } catch {
    fail(`SEA binary not found at ${binaryPath}. Run pnpm run sea:build first (or pass the binary path).`)
  }
}

export interface BootServerOptions {
  port?: number
}

export async function bootServer(
  binaryPath: string,
  dirs: TempDirs,
  env: Record<string, string>,
  logPath: string,
  options: BootServerOptions = {},
): Promise<SmokeServer> {
  const port = options.port ?? (await pickFreePort())
  const logStream = createWriteStream(logPath, { flags: 'w' })
  const logClosed = new Promise<void>((resolve) => logStream.once('close', resolve))
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

export interface BootSayakaServerOptions {
  cwd?: string
}

export async function bootSayakaServer(
  binaryPath: string,
  env: Record<string, string>,
  logPath: string,
  options: BootSayakaServerOptions = {},
): Promise<SmokeServer> {
  const port = Number(env.SAYAKA_PORT)
  if (!Number.isInteger(port) || port <= 0) {
    fail(`sayaka needs SAYAKA_PORT in its environment, got ${env.SAYAKA_PORT}`)
  }
  const logStream = createWriteStream(logPath, { flags: 'w' })
  const logClosed = new Promise<void>((resolve) => logStream.once('close', resolve))
  const child = spawn(binaryPath, [], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...scrubbedParentEnv(), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  const exitState = watchChildExit(child)
  return { child, exitState, port, logStream, logClosed, healthResponse: null }
}

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
