// Deep end-to-end smoke for the built SEA binary (`pnpm run sea:smoke`).
//
// Managed mode (default): verify dist-sea/kobato end to end against a real
// Postgres/Redis — the CLI flags, native-package extraction and loading,
// a real sharp job through the worker_threads image pool, and a full
// server lifecycle against a FRESH per-run database (`kobato_smoke_<rand>`,
// created on the same Postgres server and dropped in cleanup): boot with
// an unrelated cwd, embedded migrations, the fresh-install gate, SSR HTML,
// embedded static assets, then a seeded admin + core settings, a graceful
// restart, the installed gate, installed SSR, the @napi-rs/canvas calendar
// endpoint over HTTP, natives-cache reuse, and clean SIGTERM shutdowns.
// Temp dirs and secrets are generated per run; nothing touches the repo,
// the shared `test` database, or the user's caches.
//
// External mode (`--external <baseUrl>`): run only the HTTP assertions
// against an already-running server (e.g. the Phase-5 Docker container) —
// no binary, env, or lifecycle checks, and no database seeding. The
// calendar check degrades to SKIP on an uninstalled instance.
//
// Binary-only mode (`--binary-only <binary>`): just the checks that need
// no services — --version, --smoke-natives, and --smoke-worker against a
// dummy (validated, never connected) env. Used by the macOS and Windows
// CI targets: GitHub macOS runners have no Docker and Windows runners
// only run Windows containers, so neither can host the Postgres/Redis
// service containers; the full managed lifecycle stays on Linux.
//
// DATABASE_URL / REDIS_URL default to the docker-compose.test.yml stack
// (postgres on 127.0.0.1:5434, redis on 127.0.0.1:6381) and can be
// overridden through the environment — CI injects its service URLs the
// same way. The role must be allowed to CREATE/DROP DATABASE (the `test`
// role in both the local stack and the CI service is the cluster
// superuser). Imports: Node builtins plus `pg` (already a devDependency,
// used for the per-run database and the seed SQL); no other dependencies.
//
// The instance lifecycle (per-run database, boot, seed, HTTP polling) is
// shared with the e2e orchestrator via scripts/sea/instance.ts.

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

import type { SmokeDatabase, SmokeServer } from './instance.ts'

import { fail } from './exec.ts'
import {
  bootServer,
  createSmokeDatabase,
  DEFAULT_DATABASE_URL,
  DEFAULT_REDIS_URL,
  describeUrl,
  dropSmokeDatabase,
  ensureBinaryExists,
  fetchManual,
  makeTempDirs,
  readConvergedConfig,
  seedInstalledInstance,
  sleep,
  waitForExit,
  waitForHttp,
} from './instance.ts'
import { seaBinaryPath } from './paths.ts'

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

const SHUTDOWN_TIMEOUT_MS = 15_000
const VERSION_TIMEOUT_MS = 30_000
const NATIVES_TIMEOUT_MS = 120_000
const LOG_TAIL_LINES = 50

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
const CALENDAR_MIN_BYTES = 2_048

const results: CheckResult[] = []
let serverLogPath: string | null = null

/**
 * Initializer for variables assigned only inside `check` closures. Starting
 * from a function call (not the `null` literal) keeps the declared union —
 * TS otherwise narrows the variable to `null` at every later read, because
 * closure assignments are invisible to its flow analysis.
 */
function none<T>(): T | null {
  return null
}

/** Run one named check: print the verdict immediately, record it, never throw. */
async function check(name: string, fn: () => string | void | Promise<string | void>) {
  try {
    const detail = (await fn()) ?? ''
    results.push({ name, ok: true, detail })
    console.log(`  PASS  ${name}${detail === '' ? '' : ` — ${detail}`}`)
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, detail })
    console.log(`  FAIL  ${name} — ${detail}`)
    return false
  }
}

function tailLines(text: string, count: number) {
  return text.trim().split('\n').slice(-count).join('\n')
}

function checkVersion(binaryPath: string) {
  const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf-8', timeout: VERSION_TIMEOUT_MS })
  if (result.error) {
    throw new Error(`spawn failed: ${result.error.message}`)
  }
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.status !== 0) {
    throw new Error(`exit code ${result.status ?? 'unknown'}:\n${tailLines(output, 20)}`)
  }
  const line = result.stdout.trim()
  if (!/^kobato \S+/m.test(line)) {
    throw new Error(`unexpected output: ${line || '(empty)'}`)
  }
  return line
}

function checkNatives(binaryPath: string, cacheDir: string) {
  const expected = `SEA natives smoke passed: ${process.platform}-${process.arch}`
  const result = spawnSync(binaryPath, ['--smoke-natives'], {
    encoding: 'utf-8',
    timeout: NATIVES_TIMEOUT_MS,
    env: { ...process.env, KOBATO_CACHE_DIR: cacheDir },
  })
  if (result.error) {
    throw new Error(`spawn failed: ${result.error.message}`)
  }
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.status !== 0) {
    throw new Error(`exit code ${result.status ?? 'unknown'}:\n${tailLines(output, 20)}`)
  }
  if (!output.includes(expected)) {
    throw new Error(`missing "${expected}" in the output:\n${tailLines(output, 20)}`)
  }
  return expected
}

/**
 * `--smoke-worker` validates the full server env at import time (the pool
 * graph pulls in `@/server/infra/env`) but never connects to anything, so
 * the same env the server boot gets is passed here. The `--config` points
 * at the temp cache dir — without it env loading would auto-create
 * `kobato.config.json` next to the binary and persist the throwaway
 * database URL and smoke secrets into it.
 */
function checkWorker(binaryPath: string, env: Record<string, string>) {
  const expected = `SEA worker smoke passed: ${process.platform}-${process.arch}`
  const result = spawnSync(
    binaryPath,
    ['--config', join(env.KOBATO_CACHE_DIR, 'kobato.config.json'), '--smoke-worker'],
    {
      encoding: 'utf-8',
      timeout: NATIVES_TIMEOUT_MS,
      env: { ...process.env, ...env },
    },
  )
  if (result.error) {
    throw new Error(`spawn failed: ${result.error.message}`)
  }
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.status !== 0) {
    throw new Error(`exit code ${result.status ?? 'unknown'}:\n${tailLines(output, 20)}`)
  }
  if (!output.includes(expected)) {
    throw new Error(`missing "${expected}" in the output:\n${tailLines(output, 20)}`)
  }
  return expected
}

// A bcrypt-format placeholder (the same dummy hash the auth layer uses for
// timing equalization) — the smoke never logs in; the install gate only
// counts the row.
const SEED_ADMIN_PASSWORD = '$2b$12$EIX9MbHN0xG0yKqfNR4XPezHbhVzQzMn/37uD.LR8VgNTbQjD/II.'
const SEED_ADMIN_EMAIL = 'smoke-admin@kobato.local'

async function checkShutdown(server: SmokeServer) {
  const started = Date.now()
  server.child.kill('SIGTERM')
  const outcome = await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  if (outcome.timeout) {
    throw new Error(`still running ${SHUTDOWN_TIMEOUT_MS / 1000}s after SIGTERM (sent SIGKILL)`)
  }
  if (outcome.code === 0) {
    return `exit code 0 after ${elapsed}s`
  }
  if (outcome.signal === 'SIGTERM') {
    return `terminated by SIGTERM after ${elapsed}s`
  }
  throw new Error(`unexpected exit: code ${outcome.code ?? 'null'}, signal ${outcome.signal ?? 'none'}`)
}

/**
 * The server's bootstrap logs `SEA natives ready` with per-file counts;
 * a warm cache (populated by the --smoke-natives check) means reused > 0.
 * Read after the log stream closed so no buffered writes are missed.
 */
async function checkNativesReuse() {
  const log = await readFile(serverLogPath ?? fail('serverLogPath unset'), 'utf-8')
  const match = log.match(/"msg":"SEA natives ready","extracted":(\d+),"reused":(\d+)/)
  if (!match) {
    throw new Error('no "SEA natives ready" line in the server log')
  }
  if (Number(match[2]) === 0) {
    throw new Error(`server re-extracted the natives despite a warm cache (${match[0]})`)
  }
  return `extracted=${match[1]} reused=${match[2]}`
}

/** Fetch an SSR page and assert it is a 200 text/html document with markup. */
async function fetchSsrPage(baseUrl: string, path: string) {
  const res = await fetchManual(`${baseUrl}${path}`)
  const body = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  if (res.status !== 200) {
    throw new Error(`expected 200, got ${res.status}`)
  }
  if (!contentType.includes('text/html')) {
    throw new Error(`unexpected content-type: ${contentType}`)
  }
  if (!body.includes('<')) {
    throw new Error('response contains no markup')
  }
  return body
}

function calendarPath() {
  return `/images/calendar/${new Date().getFullYear()}/0101.png`
}

/**
 * Assert a calendar response is a direct 200 (redirect: 'manual' — any
 * redirect shows up as a 3xx here), carries a real PNG (magic bytes), and
 * is large enough that @napi-rs/canvas actually rendered something.
 */
async function assertCalendarPng(res: Response) {
  const contentType = res.headers.get('content-type') ?? ''
  if (res.status !== 200) {
    const location = res.headers.get('location')
    throw new Error(`expected 200, got ${res.status}${location ? ` (location: ${location})` : ''}`)
  }
  if (!contentType.includes('image/png')) {
    throw new Error(`unexpected content-type: ${contentType}`)
  }
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length < PNG_MAGIC.length || PNG_MAGIC.some((byte, index) => body[index] !== byte)) {
    throw new Error('body does not start with the PNG magic bytes')
  }
  if (body.length <= CALENDAR_MIN_BYTES) {
    throw new Error(`suspiciously small body: ${body.length} bytes`)
  }
  return `200 ${contentType.split(';')[0]}, ${body.length} bytes`
}

/**
 * HTTP assertions shared by managed and external mode. `healthResponse`
 * is the response the boot poll already obtained in managed mode; pass
 * null to fetch /health directly (external mode).
 */
async function runHttpChecks(baseUrl: string, healthResponse: Response | null) {
  let ssrPath: string | null = null
  await check('GET /health — boot + install gate', async () => {
    const res = healthResponse ?? (await fetchManual(`${baseUrl}/health`))
    const location = res.headers.get('location')
    if (res.status === 303 && location === '/admin/setup') {
      ssrPath = '/admin/setup'
      return '303 → /admin/setup (fresh install)'
    }
    if (res.status === 200) {
      ssrPath = '/'
      return '200 (instance already installed)'
    }
    throw new Error(
      `expected 303 → /admin/setup or 200, got ${res.status}${location ? ` (location: ${location})` : ''}`,
    )
  })

  let assetPath: string | null = null
  if (ssrPath !== null) {
    const pagePath = ssrPath
    await check(`GET ${pagePath} — SSR HTML`, async () => {
      const body = await fetchSsrPage(baseUrl, pagePath)
      const match = body.match(/(?:href|src)="(\/assets\/[^"]+?\.js)"/)
      if (!match) {
        throw new Error('no /assets/*.js reference found in the SSR HTML')
      }
      assetPath = match[1] ?? null
      return `200 text/html, ${body.length} bytes, first asset ${assetPath ?? ''}`
    })
  }

  if (assetPath !== null) {
    const firstAsset = assetPath
    await check(`GET ${firstAsset} — embedded static asset`, async () => {
      const res = await fetchManual(`${baseUrl}${firstAsset}`)
      const body = await res.arrayBuffer()
      const contentType = res.headers.get('content-type') ?? ''
      if (res.status !== 200) {
        throw new Error(`expected 200, got ${res.status}`)
      }
      if (!/javascript|ecmascript/i.test(contentType)) {
        throw new Error(`unexpected content-type: ${contentType}`)
      }
      if (body.byteLength <= 1024) {
        throw new Error(`suspiciously small body: ${body.byteLength} bytes`)
      }
      return `200 ${contentType.split(';')[0]}, ${body.byteLength} bytes`
    })
  }
}

/**
 * The @napi-rs/canvas calendar endpoint over HTTP. Managed mode requires
 * a rendered PNG; external mode tolerates an uninstalled instance (the
 * handler cannot render without a settings snapshot and answers with a
 * redirect or a 500) and reports SKIP instead of failing.
 */
async function checkCalendar(baseUrl: string, { optional }: { optional: boolean }) {
  await check(`GET ${calendarPath()} — canvas render over HTTP`, async () => {
    const res = await fetchManual(`${baseUrl}${calendarPath()}`)
    if (optional && res.status >= 300 && res.status < 400) {
      return `SKIP — ${res.status} redirect (uninstalled instance)`
    }
    if (optional && res.status >= 500) {
      return `SKIP — HTTP ${res.status} (uninstalled instance: no settings snapshot)`
    }
    return assertCalendarPng(res)
  })
}

/** Returns a cleanup callback; the caller runs it after the summary/log dump. */
async function runManaged(binaryPath: string) {
  await ensureBinaryExists(binaryPath)
  const databaseUrl = process.env.database__url ?? DEFAULT_DATABASE_URL
  const redisUrl = process.env.redis__url ?? DEFAULT_REDIS_URL
  const dirs = await makeTempDirs()
  serverLogPath = join(dirs.root, 'server.log')

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    database: ${describeUrl(databaseUrl)}`)
  console.log(`    redis:    ${describeUrl(redisUrl)}`)
  console.log(`    temp dir: ${dirs.root}`)

  let server = none<SmokeServer>()
  let smokeDatabase = none<SmokeDatabase>()
  try {
    await check('kobato --version', () => checkVersion(binaryPath))
    await check('kobato --smoke-natives (sharp + canvas)', () => checkNatives(binaryPath, dirs.cache))

    await check('create per-run smoke database', async () => {
      smokeDatabase = await createSmokeDatabase(databaseUrl)
      return `${smokeDatabase.databaseName} on ${describeUrl(databaseUrl)}`
    })

    if (smokeDatabase !== null) {
      const env = {
        database__url: smokeDatabase.smokeDatabaseUrl,
        redis__url: redisUrl,
        auth__sessionSecret: randomBytes(32).toString('hex'),
        security__encryptionKey: randomBytes(32).toString('hex'),
        paths__data: dirs.data,
        KOBATO_CACHE_DIR: dirs.cache,
        NODE_ENV: 'production',
      }

      await check('kobato --smoke-worker (sharp worker pool)', () => checkWorker(binaryPath, env))

      const booted = await check('server boot (natives + migrations + redis)', async () => {
        server = await bootServer(binaryPath, dirs, env, serverLogPath ?? fail('serverLogPath unset'))
        console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
        const started = Date.now()
        server.healthResponse = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
        return `HTTP ${server.healthResponse.status} after ${((Date.now() - started) / 1000).toFixed(1)}s on port ${server.port}`
      })

      if (booted && server !== null) {
        const bootedServer = server
        await runHttpChecks(`http://127.0.0.1:${bootedServer.port}`, bootedServer.healthResponse)
        await check('SIGTERM clean shutdown', () => checkShutdown(bootedServer))
        // Natives-ready is logged before the listener starts, but wait for
        // the stream flush anyway — buffered writes outlive the process.
        await Promise.race([bootedServer.logClosed, sleep(2_000)])
        await check('natives cache reused by the server', () => checkNativesReuse())
        await check('config file converged (env written back)', async () => {
          const converged = await readConvergedConfig(join(dirs.root, 'kobato.config.json'))
          if (converged.databaseUrl !== smokeDatabase?.smokeDatabaseUrl) {
            throw new Error(`database.url is ${converged.databaseUrl}, expected ${smokeDatabase?.smokeDatabaseUrl}`)
          }
          return 'database.url + sessionSecret persisted'
        })
      }

      // ── Seeded phase: flip the instance to "installed" and reboot ──
      //
      // The install gate itself evaluates `hasAdmin()` per request (the
      // production React build's `cache()` is a pass-through), but the
      // settings snapshot is only (re)loaded at boot and the seeded
      // `blog.*` rows are invisible until then — so the server is
      // gracefully restarted. The restart doubles as a second
      // natives-cache reuse exercise.
      const seeded =
        booted &&
        (await check('seed admin + core settings (SQL)', () =>
          seedInstalledInstance(env.database__url, { email: SEED_ADMIN_EMAIL, passwordHash: SEED_ADMIN_PASSWORD }),
        ))
      if (seeded) {
        // The restart runs with a REDUCED env on purpose: database/redis/
        // secrets/paths all come from the config file the first boot
        // converged (env overrides were written back) — this is the
        // file-only boot proof for the new configuration model. Only
        // process-level vars (cache dir, NODE_ENV) stay in the env.
        const fileOnlyEnv = {
          KOBATO_CACHE_DIR: dirs.cache,
          NODE_ENV: 'production',
        }
        const restarted = await check('server restart (seeded install, config file only)', async () => {
          server = await bootServer(binaryPath, dirs, fileOnlyEnv, serverLogPath ?? fail('serverLogPath unset'))
          console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
          const started = Date.now()
          server.healthResponse = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
          return `HTTP ${server.healthResponse.status} after ${((Date.now() - started) / 1000).toFixed(1)}s on port ${server.port}`
        })

        if (restarted && server !== null) {
          const seededServer = server
          const baseUrl = `http://127.0.0.1:${seededServer.port}`
          await check('GET /health — installed instance', async () => {
            const res = seededServer.healthResponse ?? (await fetchManual(`${baseUrl}/health`))
            if (res.status !== 200) {
              throw new Error(`expected 200, got ${res.status}`)
            }
            return '200 (admin present)'
          })
          await check('GET / — SSR HTML (installed)', async () => {
            const body = await fetchSsrPage(baseUrl, '/')
            return `200 text/html, ${body.length} bytes`
          })
          await checkCalendar(baseUrl, { optional: false })
          await check('SIGTERM clean shutdown (seeded install)', () => checkShutdown(seededServer))
          await Promise.race([seededServer.logClosed, sleep(2_000)])
          await check('natives cache reused after restart', () => checkNativesReuse())
        }
      }
    }
  } finally {
    if (server !== null && !server.exitState.exited) {
      server.child.kill('SIGKILL')
    }
  }

  return async () => {
    if (smokeDatabase !== null) {
      const { databaseName } = smokeDatabase
      await dropSmokeDatabase(databaseUrl, databaseName).catch((error: unknown) => {
        console.warn(
          `Warning: failed to drop ${databaseName}: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Binary-only mode: the service-free checks (CLI flags, natives extraction
 * and loading, the sharp worker pool). `--smoke-worker` validates the full
 * server env at import time but never connects, so dummy URLs satisfy it.
 * Returns a cleanup callback for the temp dirs (natives cache included).
 */
async function runBinaryOnly(binaryPath: string) {
  await ensureBinaryExists(binaryPath)
  const dirs = await makeTempDirs()

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    temp dir: ${dirs.root}`)

  await check('kobato --version', () => checkVersion(binaryPath))
  await check('kobato --smoke-natives (sharp + canvas)', () => checkNatives(binaryPath, dirs.cache))
  await check('kobato --smoke-worker (sharp worker pool)', () =>
    checkWorker(binaryPath, {
      database__url: process.env.database__url ?? DEFAULT_DATABASE_URL,
      redis__url: process.env.redis__url ?? DEFAULT_REDIS_URL,
      auth__sessionSecret: randomBytes(32).toString('hex'),
      security__encryptionKey: randomBytes(32).toString('hex'),
      paths__data: dirs.data,
      KOBATO_CACHE_DIR: dirs.cache,
      NODE_ENV: 'production',
    }),
  )

  return async () => {
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }
}

function normalizeBaseUrl(rawBaseUrl: string) {
  let url: URL
  try {
    url = new URL(rawBaseUrl)
  } catch {
    fail(`Invalid base URL: ${rawBaseUrl}`)
  }
  return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')}`
}

async function main() {
  const args = process.argv.slice(2)
  let cleanup: (() => Promise<void>) | null = null

  if (args[0] === '--external') {
    if (!args[1]) {
      fail('Usage: node scripts/sea/smoke.ts --external <baseUrl>')
    }
    const baseUrl = normalizeBaseUrl(args[1])
    console.log(`==> SEA smoke (external: ${baseUrl})`)
    await runHttpChecks(baseUrl, null)
    // No seeding in external mode — the database belongs to someone else.
    await checkCalendar(baseUrl, { optional: true })
  } else if (args[0] === '--binary-only') {
    const binaryPath = args[1] ? resolvePath(args[1]) : seaBinaryPath()
    console.log('==> SEA smoke (binary-only)')
    cleanup = await runBinaryOnly(binaryPath)
  } else {
    if (args[0]?.startsWith('--')) {
      fail('Usage: node scripts/sea/smoke.ts [--external <baseUrl> | --binary-only [path-to-binary] | path-to-binary]')
    }
    const binaryPath = args[0] ? resolvePath(args[0]) : seaBinaryPath()
    console.log('==> SEA smoke (managed)')
    cleanup = await runManaged(binaryPath)
  }

  const failed = results.filter((result) => !result.ok)
  if (failed.length === 0) {
    console.log(`==> SEA smoke: all ${results.length} checks passed`)
  } else {
    console.log(`==> SEA smoke: ${failed.length} of ${results.length} checks failed`)
    for (const result of failed) {
      console.log(`  failed: ${result.name}`)
    }
    if (serverLogPath !== null) {
      try {
        const log = await readFile(serverLogPath, 'utf-8')
        console.error(`\n--- last ${LOG_TAIL_LINES} lines of ${serverLogPath} ---`)
        console.error(tailLines(log, LOG_TAIL_LINES))
      } catch {
        console.error(`(no server log at ${serverLogPath})`)
      }
    }
  }

  if (cleanup !== null) {
    await cleanup()
  }
  process.exit(failed.length === 0 ? 0 : 1)
}

await main()
