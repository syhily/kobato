// Shared lifecycle for driving a built SEA binary: per-run temp dirs (no
// external services), boot with output captured to a log file, HTTP boot
// polling, and the installed-instance SQL seed. Used by smoke.ts and e2e.ts.

import type { ChildProcess } from 'node:child_process'
import type { WriteStream } from 'node:fs'

import { DuckDBInstance } from '@duckdb/node-api'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { fail } from './exec.ts'

export const BOOT_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 500
const FETCH_TIMEOUT_MS = 5_000

export interface ExitState {
  exited: boolean
  code: number | null
  signal: NodeJS.Signals | null
}

export interface TempDirs {
  root: string
  data: string
  cache: string
  cwd: string
}

export interface SmokeServer {
  child: ChildProcess
  exitState: ExitState
  port: number
  logStream: WriteStream
  logClosed: Promise<void>
  healthResponse: Response | null
}

export interface SmokeDatabases {
  /** SQLite content database. */
  database: string
  /** DuckDB analytics sidecar. */
  analytics: string
}

export function smokeDatabases(dirs: TempDirs): SmokeDatabases {
  return { database: join(dirs.data, 'kobato.db'), analytics: join(dirs.data, 'analytics.duckdb') }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A free high port on loopback, race-prone by nature but fine for a smoke. */
export function pickFreePort() {
  return new Promise<number>((resolve, reject) => {
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

export async function fetchManual(url: string) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

/**
 * Parent env minus config vars (`__`-suffixed — env > file) and KOBATO_*
 * runtime vars (a leaked KOBATO_NATIVES_DIR would redirect extraction away
 * from the per-run cache). Deliberate vars are re-injected per spawn.
 */
export function scrubbedParentEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !entry[0].includes('__') && !entry[0].startsWith('KOBATO_'),
    ),
  )
}

export async function makeTempDirs(): Promise<TempDirs> {
  const root = await mkdtemp(join(tmpdir(), 'kobato-smoke-'))
  const dirs = { root, data: join(root, 'data'), cache: join(root, 'cache'), cwd: join(root, 'cwd') }
  await mkdir(dirs.data, { recursive: true })
  await mkdir(dirs.cache, { recursive: true })
  await mkdir(dirs.cwd, { recursive: true })
  return dirs
}

export async function ensureBinaryExists(binaryPath: string) {
  try {
    await stat(binaryPath)
  } catch {
    fail(`SEA binary not found at ${binaryPath}. Run pnpm run sea:build first (or pass the binary path).`)
  }
}

export interface SeedAdminOptions {
  email: string
  /** bcrypt hash of the admin's password (placeholder when the caller never logs in). */
  passwordHash: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export interface ConvergedConfig {
  database: string
  sessionSecret: string
}

/**
 * Assert a temp config file converged: env overrides were written back as
 * raw strings, never the schema-transformed shape.
 */
export async function readConvergedConfig(configPath: string): Promise<ConvergedConfig> {
  const parsed: unknown = JSON.parse(await readFile(configPath, 'utf-8'))
  const storage = isRecord(parsed) && isRecord(parsed.storage) ? parsed.storage : null
  const security = isRecord(parsed) && isRecord(parsed.security) ? parsed.security : null
  if (storage === null || typeof storage.database !== 'string' || storage.database === '') {
    throw new Error(`config file did not converge: ${configPath} has no storage.database`)
  }
  if (security === null || typeof security.sessionSecret !== 'string' || security.sessionSecret.length < 32) {
    throw new Error(`config file did not converge: ${configPath} has no security.sessionSecret`)
  }
  return { database: storage.database, sessionSecret: security.sessionSecret }
}

/**
 * Flip the instance to "installed" with plain SQL (server stopped — no WAL
 * contention): one minimal admin row — `hasAdmin()` is the whole install
 * gate — plus the `blog.general` / `blog.assets` roots the settings
 * hydration requires. Both payloads must pass the real section schemas.
 */
export async function seedInstalledInstance(databasePath: string, admin: SeedAdminOptions) {
  const year = new Date().getFullYear()
  const general = JSON.stringify({
    title: 'Kobato Smoke',
    description: 'SEA smoke test instance',
    website: 'http://127.0.0.1',
    keywords: [],
    author: { name: 'Smoke Admin', email: admin.email, url: 'http://127.0.0.1' },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: year,
    icpNo: '',
    moeIcpNo: '',
  })
  const assets = JSON.stringify({
    asset: { host: '127.0.0.1', scheme: 'http' },
    storage: {
      enabled: false,
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  })

  const db = new DatabaseSync(databasePath)
  try {
    const now = Date.now()
    db.prepare(
      `INSERT INTO "user" ("name", "email", "password", "role", "created_at", "updated_at")
       VALUES ('Smoke Admin', ?, ?, 'admin', ?, ?)
       ON CONFLICT ("email") DO NOTHING`,
    ).run(admin.email, admin.passwordHash, now, now)
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.general', ?, ?, NULL), ('blog.assets', ?, ?, NULL)
       ON CONFLICT ("scope") DO NOTHING`,
    ).run(general, now, assets, now)
    const row: unknown = db
      .prepare(`SELECT count(*) AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`)
      .get()
    const admins =
      isRecord(row) && (typeof row.admins === 'number' || typeof row.admins === 'bigint') ? Number(row.admins) : -1
    if (admins !== 1) {
      throw new Error(`expected exactly 1 admin after seeding, found ${admins}`)
    }
    return 'admin row + blog.general/blog.assets inserted'
  } finally {
    db.close()
  }
}

/**
 * Open the analytics sidecar AFTER shutdown (its close checkpoints the WAL)
 * and prove page views landed as access_log rows.
 */
export async function scanAccessLog(analyticsPath: string): Promise<{ rows: number; paths: number }> {
  const instance = await DuckDBInstance.create(analyticsPath)
  try {
    const connection = await instance.connect()
    const result = await connection.runAndReadAll(
      'SELECT count(*) AS rows, count(DISTINCT path) AS paths FROM access_log',
    )
    const row: unknown = result.getRowObjects()[0]
    connection.closeSync()
    const cell = (key: string): number =>
      isRecord(row) && (typeof row[key] === 'number' || typeof row[key] === 'bigint') ? Number(row[key]) : 0
    return { rows: cell('rows'), paths: cell('paths') }
  } finally {
    instance.closeSync()
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
  const exitState: ExitState = { exited: false, code: null, signal: null }
  child.once('exit', (code, signal) => {
    exitState.exited = true
    exitState.code = code
    exitState.signal = signal
  })
  return { child, exitState, port, logStream, logClosed, healthResponse: null }
}

/** Poll until the server answers with ANY HTTP status (or fails boot). */
export async function waitForHttp(url: string, exitState: ExitState) {
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

export async function waitForExit(server: SmokeServer, timeoutMs: number) {
  const { child, exitState } = server
  if (exitState.exited) {
    return { code: exitState.code, signal: exitState.signal, timeout: false }
  }
  // Two single-resolution promises raced — the loser resolves into the void.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; timeout: boolean }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal, timeout: false }))
  })
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<{ code: null; signal: null; timeout: true }>((resolve) => {
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
