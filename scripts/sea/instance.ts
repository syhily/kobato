// Shared lifecycle for driving a built SEA binary.
//
// Extracted from scripts/sea/smoke.ts so both the deep managed smoke
// (smoke.ts) and the HTTP e2e orchestrator (e2e.ts) boot instances the
// exact same way: per-run temp dirs (the SQLite content file and the
// DuckDB analytics sidecar both live under `dirs.data` — no external
// service at all), server boot with output captured to a log file, HTTP
// boot polling, and the "installed instance" SQL seed.
//
// Imports: Node builtins (the seed SQL runs through node:sqlite) plus
// @duckdb/node-api (a runtime dependency — the analytics round-trip
// check reads the sidecar file the binary wrote).

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

/** Per-run database file paths (both live under `dirs.data`). */
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
  /** bcrypt hash of the admin's password (a placeholder hash when the
   *  caller never logs in — see smoke.ts). */
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
 * Assert a temp config file converged: the env-driven boot wrote its
 * overrides back (`storage.database` + `security.sessionSecret` present as
 * raw strings — never the schema-transformed shape). Used by the smoke's
 * and the e2e orchestrator's convergence checks.
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
 * Flip the instance to "installed" with plain SQL against the SQLite
 * content file (the server is stopped — no WAL contention):
 *   1. one minimal admin row — `hasAdmin()` (role = 'admin' AND
 *      deleted_at IS NULL) is the whole install gate;
 *   2. the two settings scope roots the settings hydration requires
 *      (`blog.general` → siteIdentity, `blog.assets` → assets). On the
 *      next boot the server's own hydration backfills every other section
 *      with registry defaults — the same payloads the install flow
 *      writes, without replaying the passkey/setup-token wizard.
 * Both payloads must pass the real section Zod schemas at hydration time.
 * Timestamps are epoch-ms integers (`timestamp_ms` columns), settings
 * `data` is plain-JSON text.
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
 * DuckDB round-trip verification: open the analytics sidecar AFTER the
 * server shut down (its close checkpoints the WAL into one clean file)
 * and prove the page views fetched over HTTP landed as access_log rows
 * (track → batcher → Appender → file). Returns row and distinct-path
 * counts from one aggregate scan.
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
 * Spawn the server with an unrelated cwd and both output streams captured
 * to `logPath` (truncated per boot, so each lifecycle gets its own log).
 * Natives extraction, migrations, and the HTTP listener all happen before
 * the first response.
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
  // The config file MUST live inside the per-run temp root: without an
  // explicit --config the binary would create/read kobato.config.json in
  // its own directory or ~/.config and persist smoke secrets + the
  // throwaway database path into real locations.
  //
  // Config vars (`storage__database`, `security__sessionSecret`, …) must
  // NOT be inherited from the parent environment: a leaked value
  // silently overrides the converged config file (env > file) — the
  // file-only restart would then boot against a foreign database instead
  // of the per-run smoke one. Config reaches the child only through the
  // explicit `env` argument (and server__port below).
  // KOBATO_* runtime vars (natives dir, cache dir) must also stay out:
  // an operator-set KOBATO_NATIVES_DIR would redirect the child's native
  // extraction away from the per-run cache and false-fail the layout
  // checks.
  const parentEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.includes('__') && !key.startsWith('KOBATO_')),
  )
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
  // Two single-resolution promises raced: the child's exit, or the timeout
  // that SIGKILLs it. The loser resolves into the void (its listener/timer
  // is discarded), so no promise ever resolves twice.
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
