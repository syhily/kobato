// Shared lifecycle for driving a built SEA binary against real services.
//
// Extracted from scripts/sea/smoke.ts so both the deep managed smoke
// (smoke.ts) and the HTTP e2e orchestrator (e2e.ts) boot instances the
// exact same way: a per-run throwaway database (`kobato_smoke_<rand>`,
// created on the same Postgres server and dropped in cleanup), per-run
// temp dirs, server boot with output captured to a log file, HTTP boot
// polling, and the "installed instance" SQL seed.
//
// Imports: Node builtins plus `pg` (already a devDependency, used for the
// per-run database and the seed SQL); no other dependencies.

import type { ChildProcess } from 'node:child_process'
import type { WriteStream } from 'node:fs'

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

import { fail } from './exec.ts'

export const DEFAULT_DATABASE_URL = 'postgres://test:test@127.0.0.1:5434/test'
export const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6381'

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

export interface SmokeDatabase {
  databaseName: string
  smokeDatabaseUrl: string
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Connection URLs may carry credentials — print host + path only. */
export function describeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    return `${url.host}${url.pathname}`
  } catch {
    return '(unparseable URL)'
  }
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

/**
 * Create a throwaway database on the same Postgres server so the run never
 * touches a shared one. Returns the smoke DATABASE_URL (same credentials,
 * swapped path). The caller drops the database in cleanup.
 */
export async function createSmokeDatabase(baseDatabaseUrl: string): Promise<SmokeDatabase> {
  const databaseName = `kobato_smoke_${randomBytes(4).toString('hex')}`
  const client = new pg.Client({ connectionString: baseDatabaseUrl })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await client.end()
  }
  const url = new URL(baseDatabaseUrl)
  url.pathname = `/${databaseName}`
  return { databaseName, smokeDatabaseUrl: url.toString() }
}

/** Best-effort drop of the per-run database; failures are logged, not fatal. */
export async function dropSmokeDatabase(baseDatabaseUrl: string, databaseName: string) {
  const client = new pg.Client({ connectionString: baseDatabaseUrl })
  try {
    await client.connect()
    // FORCE terminates any lingering backend connections from the stopped
    // server (PG 13+; the local test stack and CI service are PG 17).
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  } finally {
    await client.end().catch(() => undefined)
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
  databaseUrl: string
  sessionSecret: string
}

/**
 * Assert a temp config file converged: the env-driven boot wrote its
 * overrides back (`database.url` + `auth.sessionSecret` present as raw
 * strings — never the schema-transformed shape). Used by the smoke's and
 * the e2e orchestrator's convergence checks.
 */
export async function readConvergedConfig(configPath: string): Promise<ConvergedConfig> {
  const parsed: unknown = JSON.parse(await readFile(configPath, 'utf-8'))
  const database = isRecord(parsed) && isRecord(parsed.database) ? parsed.database : null
  const auth = isRecord(parsed) && isRecord(parsed.auth) ? parsed.auth : null
  if (database === null || typeof database.url !== 'string' || database.url === '') {
    throw new Error(`config file did not converge: ${configPath} has no database.url`)
  }
  if (auth === null || typeof auth.sessionSecret !== 'string' || auth.sessionSecret.length < 32) {
    throw new Error(`config file did not converge: ${configPath} has no auth.sessionSecret`)
  }
  return { databaseUrl: database.url, sessionSecret: auth.sessionSecret }
}

/**
 * Flip the instance to "installed" with plain SQL:
 *   1. one minimal admin row — `hasAdmin()` (role = 'admin' AND
 *      deleted_at IS NULL) is the whole install gate;
 *   2. the two settings scope roots the settings hydration requires
 *      (`blog.general` → siteIdentity, `blog.assets` → assets). On the
 *      next boot the server's own hydration backfills every other section
 *      with registry defaults — the same payloads the install flow
 *      writes, without replaying the passkey/setup-token wizard.
 * Both payloads must pass the real section Zod schemas at hydration time.
 */
export async function seedInstalledInstance(databaseUrl: string, admin: SeedAdminOptions) {
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

  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO "user" ("name", "email", "password", "role", "created_at", "updated_at")
       VALUES ('Smoke Admin', $1, $2, 'admin', now(), now())
       ON CONFLICT ("email") DO NOTHING`,
      [admin.email, admin.passwordHash],
    )
    await client.query(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.general', $1::jsonb, now(), NULL), ('blog.assets', $2::jsonb, now(), NULL)
       ON CONFLICT ("scope") DO NOTHING`,
      [general, assets],
    )
    const { rows } = await client.query(
      `SELECT count(*)::int AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`,
    )
    if (rows[0].admins !== 1) {
      throw new Error(`expected exactly 1 admin after seeding, found ${rows[0].admins}`)
    }
    return 'admin row + blog.general/blog.assets inserted'
  } finally {
    await client.end()
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
  // throwaway database URL into real locations.
  const child = spawn(binaryPath, ['--config', join(dirs.root, 'kobato.config.json')], {
    cwd: dirs.cwd,
    env: { ...process.env, ...env, server__port: String(port) },
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
