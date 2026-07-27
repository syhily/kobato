// Deep end-to-end smoke for the built SEA binary.
//
// Managed mode (default): verify dist-sea/kobato end to end — CLI flags,
// native-package extraction, worker pool, and a full server lifecycle
// against a fresh per-run database (`kobato_smoke_<rand>`): boot,
// migrations, install gate, SSR, embedded assets, seeded admin + settings,
// graceful restart, installed SSR, canvas calendar, natives-cache reuse,
// SIGTERM shutdowns.
//
// External mode (`--external <baseUrl>`): HTTP assertions only against an
// already-running server — no binary checks, no seeding.
//
// Binary-only mode (`--binary-only <binary>`): service-free checks only
// (--version, --smoke-natives, --smoke-worker). Used by macOS/Windows CI.
//
// Instance lifecycle is shared with e2e via scripts/sea/instance.ts.

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

import type { SmokeDatabase, SmokeServer } from './instance.ts'

import { fail } from './exec.ts'
import {
  bootServer,
  createSmokeDatabase,
  DEFAULT_DATABASE_URL,
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

// The blob is the binary's variable part: uncompressed it was ~87 MB, the
// compressed payload must stay in the ~25-35 MB band. A regression to
// uncompressed embedding roughly doubles the binary — fail loudly here
// rather than at release time. `--build-sea` builds the blob into the
// binary internally, so the regression is caught by a binary-size budget
// (linux node26 base ~148 MB + ~25 MB payload).
const BINARY_MAX_BYTES = 190 * 1024 * 1024

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

/**
 * Assert the payload stays within the compression budget. `--build-sea`
 * builds the blob into the binary internally, so the binary size is
 * budgeted (node26 base ~148 MB + compressed payload ~25 MB). The binary
 * under test is the one passed to the smoke — CI renames it to
 * `kobato-<target>` before running `--binary-only`, so the default
 * `dist-sea/kobato` path cannot be assumed. Runs in managed and
 * binary-only mode (external mode tests someone else's server).
 */
async function checkBinarySize(binaryPath: string) {
  const binary = await stat(binaryPath).catch(() => null)
  if (binary === null) {
    throw new Error(`${binaryPath} not found — run pnpm run sea:build first`)
  }
  const mb = (binary.size / 1024 / 1024).toFixed(1)
  if (binary.size > BINARY_MAX_BYTES) {
    throw new Error(`binary is ${mb} MB, over the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`)
  }
  return `${mb} MB binary within the ${BINARY_MAX_BYTES / 1024 / 1024} MB budget`
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

/**
 * The extraction dir is FLAT and holds exactly the native dynamic
 * libraries: sharp.node + skia.node + the libvips files (one on
 * darwin/linux, two DLLs on win32) — no node_modules tree, no package
 * files. The materialized bundles (server.mjs, smoke-worker.mjs) share
 * the dir by design and are excluded from the count. Assert the layout
 * right after `--smoke-natives` populated it.
 */
async function checkNativesLayout(cacheDir: string) {
  const expectedCount = process.platform === 'win32' ? 4 : 3
  const entries = await readdir(cacheDir)
  const nativesDirs = entries.filter((entry) => entry.startsWith('natives-'))
  if (nativesDirs.length !== 1) {
    throw new Error(`expected exactly one natives-* dir in ${cacheDir}, found ${nativesDirs.length}`)
  }
  const dir = join(cacheDir, nativesDirs[0]!)
  const files = await readdir(dir, { withFileTypes: true })
  if (files.some((file) => file.isDirectory())) {
    throw new Error(`natives dir is not flat: ${files.map((file) => file.name).join(', ')}`)
  }
  const names = files
    .map((file) => file.name)
    .filter((name) => name !== 'server.mjs' && name !== 'smoke-worker.mjs')
    .sort()
  if (names.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} extracted native files, found ${names.length}: ${names.join(', ')}`)
  }
  if (!names.includes('sharp.node') || !names.includes('skia.node')) {
    throw new Error(`sharp.node / skia.node missing from the extraction: ${names.join(', ')}`)
  }
  if (!names.every((name) => name === 'sharp.node' || name === 'skia.node' || name.startsWith('libvips'))) {
    throw new Error(`unexpected files in the extraction: ${names.join(', ')}`)
  }
  return `${names.length} flat files: ${names.join(', ')}`
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
 * a warm cache (populated by the --smoke-natives check) means every
 * native library is reused. Read after the log stream closed so no
 * buffered writes are missed. Lines are parsed as JSON and matched on
 * the `msg` field — never on key order or substrings, so a logger
 * refactor can't false-fail the smoke.
 */
async function checkNativesReuse() {
  const expectedCount = process.platform === 'win32' ? 4 : 3
  const log = await readFile(serverLogPath ?? fail('serverLogPath unset'), 'utf-8')
  let extracted: number | null = null
  let reused: number | null = null
  for (const line of log.split('\n')) {
    if (!line.startsWith('{')) {
      continue
    }
    try {
      const entry: unknown = JSON.parse(line)
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'msg' in entry &&
        entry.msg === 'SEA natives ready' &&
        'extracted' in entry &&
        'reused' in entry
      ) {
        extracted = Number(entry.extracted)
        reused = Number(entry.reused)
      }
    } catch {
      // Not a JSON line (warnings, stacks) — skip.
    }
  }
  if (extracted === null || reused === null) {
    throw new Error('no "SEA natives ready" line in the server log')
  }
  if (reused !== expectedCount) {
    throw new Error(
      `server did not reuse the warm natives cache (extracted=${extracted} reused=${reused}, expected reused=${expectedCount})`,
    )
  }
  return `extracted=${extracted} reused=${reused}`
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
  const dirs = await makeTempDirs()
  serverLogPath = join(dirs.root, 'server.log')

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    database: ${describeUrl(databaseUrl)}`)
  console.log(`    temp dir: ${dirs.root}`)

  let server = none<SmokeServer>()
  let smokeDatabase = none<SmokeDatabase>()
  try {
    await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath))
    await check('kobato --version', () => checkVersion(binaryPath))
    await check('kobato --smoke-natives (sharp + canvas)', () => checkNatives(binaryPath, dirs.cache))
    await check('natives extraction is the flat dynamic-library set', () => checkNativesLayout(dirs.cache))

    await check('create per-run smoke database', async () => {
      smokeDatabase = await createSmokeDatabase(databaseUrl)
      return `${smokeDatabase.databaseName} on ${describeUrl(databaseUrl)}`
    })

    if (smokeDatabase !== null) {
      const env = {
        database__url: smokeDatabase.smokeDatabaseUrl,
        security__sessionSecret: randomBytes(32).toString('hex'),
        security__encryptionKey: randomBytes(32).toString('hex'),
        storage__data: dirs.data,
        KOBATO_CACHE_DIR: dirs.cache,
        NODE_ENV: 'production',
      }

      await check('kobato --smoke-worker (sharp worker pool)', () => checkWorker(binaryPath, env))

      const booted = await check('server boot (natives + migrations)', async () => {
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
        // The restart runs with a REDUCED env on purpose: database/
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

  await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath))
  await check('kobato --version', () => checkVersion(binaryPath))
  await check('kobato --smoke-natives (sharp + canvas)', () => checkNatives(binaryPath, dirs.cache))
  await check('natives extraction is the flat dynamic-library set', () => checkNativesLayout(dirs.cache))
  await check('kobato --smoke-worker (sharp worker pool)', () =>
    checkWorker(binaryPath, {
      database__url: process.env.database__url ?? DEFAULT_DATABASE_URL,
      security__sessionSecret: randomBytes(32).toString('hex'),
      security__encryptionKey: randomBytes(32).toString('hex'),
      storage__data: dirs.data,
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
