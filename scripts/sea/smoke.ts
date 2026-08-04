// Deep end-to-end smoke for the built SEA binaries.
//
// Dual build line (see scripts/sea/target.ts):
//
//   core (default): verify dist-sea/kobato end to end — CLI flags,
//   native-package extraction, worker pool, and a full server lifecycle
//   against per-run temp files (SQLite content DB + DuckDB analytics
//   sidecar under one mkdtemp root — no external services): boot,
//   migrations, install gate, admin SSR, embedded assets, seeded admin +
//   settings, graceful restart, /api reachability, frontend-key JWT
//   positive/negative flows, canvas calendar, DuckDB analytics
//   round-trip, natives-cache reuse, SIGTERM shutdowns.
//
//   frontend: verify dist-sea/kobato-frontend — the public SSR service:
//   budget, --version, boot + /health, seeded restart, SIGTERM shutdown.
//   No natives/worker checks (the binary carries neither). Optional core
//   connectivity via `--core-url <url>` (or KOBATO_SMOKE_CORE_URL): the
//   orchestrator renders `/` through the core Content API, fetches the
//   configured core /health, and asserts the /health echo — SKIP when no
//   URL is given (a frontend without a configured core has nothing to
//   render).
//
// External mode (`--external <baseUrl>`): HTTP assertions only against an
// already-running server — no binary checks, no seeding.
//
// Binary-only mode (`--binary-only <binary>`): service-free checks only
// (core: --version, --smoke-natives, --smoke-worker; frontend:
// --version).
//
// Instance lifecycle is shared with e2e via scripts/sea/instance.ts.

import { spawnSync } from 'node:child_process'
import { createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { SmokeServer } from './instance.ts'

// The one src import: a tiny shared type helper. Relative path on
// purpose — this script runs under plain `node` (no tsconfig path
// aliases), same convention as `e2e.ts`'s `defaults.ts` import.
import { unsafeCast } from '../../packages/shared/src/utils/unsafe-cast.ts'
import { BINARY_MAX_BYTES, FRONTEND_BINARY_MAX_BYTES } from './budget.ts'
import { fail } from './exec.ts'
import {
  applyMigrationsSql,
  bootServer,
  ensureBinaryExists,
  fetchManual,
  makeTempDirs,
  readConvergedConfig,
  scrubbedParentEnv,
  seedInstalledInstance,
  sleep,
  smokeDatabases,
  waitForExit,
  waitForHttp,
} from './instance.ts'
import { seaBinaryPath } from './paths.ts'
import { resolveSeaTarget, type SeaTarget } from './target.ts'

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

/**
 * Assert the payload stays within the compression budget. `--build-sea`
 * builds the blob into the binary internally, so the binary size is
 * budgeted (node26 base ~148 MB + compressed payload; the frontend line
 * has a smaller budget — no natives). The binary under test is the one
 * passed to the smoke — CI renames it to `kobato-<target>` before
 * running `--binary-only`, so the default `dist-sea/kobato*` path cannot
 * be assumed. Runs in managed and binary-only mode (external mode tests
 * someone else's server).
 */
async function checkBinarySize(binaryPath: string, target: SeaTarget) {
  const binary = await stat(binaryPath).catch(() => null)
  if (binary === null) {
    throw new Error(`${binaryPath} not found — run pnpm run sea:build first`)
  }
  const maxBytes = target === 'core' ? BINARY_MAX_BYTES : FRONTEND_BINARY_MAX_BYTES
  const mb = (binary.size / 1024 / 1024).toFixed(1)
  if (binary.size > maxBytes) {
    throw new Error(`binary is ${mb} MB, over the ${maxBytes / 1024 / 1024} MB budget`)
  }
  return `${mb} MB binary within the ${maxBytes / 1024 / 1024} MB budget`
}

/** The version line prefix differs per line: `kobato` vs `kobato-frontend`. */
function versionPrefix(target: SeaTarget) {
  return target === 'core' ? 'kobato' : 'kobato-frontend'
}

function checkVersion(binaryPath: string, target: SeaTarget) {
  const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf-8', timeout: VERSION_TIMEOUT_MS })
  if (result.error) {
    throw new Error(`spawn failed: ${result.error.message}`)
  }
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.status !== 0) {
    throw new Error(`exit code ${result.status ?? 'unknown'}:\n${tailLines(output, 20)}`)
  }
  const line = result.stdout.trim()
  if (!new RegExp(`^${versionPrefix(target)} \\S+`, 'm').test(line)) {
    throw new Error(`unexpected output: ${line || '(empty)'}`)
  }
  return line
}

/**
 * The extraction dir is FLAT and holds exactly the native dynamic
 * libraries: sharp.node + skia.node + duckdb.node + the libvips files
 * (one on darwin/linux, two DLLs on win32) + the libduckdb library
 * (libduckdb.dylib/.so; duckdb.dll on win32) + skia's ICU datafile
 * (icudtl.dat — win32 only; the Windows skia builds probe for it next to
 * the loaded module and crash fatally without it) — no node_modules
 * tree, no package files. The materialized bundles (server.mjs,
 * smoke-worker.mjs) share the dir by design and are excluded from the
 * count. Assert the layout right after `--smoke-natives` populated it.
 * (Core line only — the frontend binary extracts nothing.)
 */
const NATIVES_FILE_COUNT = process.platform === 'win32' ? 7 : 5

function isExpectedNativeFile(name: string): boolean {
  return (
    name === 'sharp.node' ||
    name === 'skia.node' ||
    name === 'duckdb.node' ||
    name === 'duckdb.dll' ||
    name === 'icudtl.dat' ||
    name.startsWith('libvips') ||
    name.startsWith('libduckdb')
  )
}

async function checkNativesLayout(cacheDir: string) {
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
  if (names.length !== NATIVES_FILE_COUNT) {
    throw new Error(`expected ${NATIVES_FILE_COUNT} extracted native files, found ${names.length}: ${names.join(', ')}`)
  }
  if (!names.includes('sharp.node') || !names.includes('skia.node') || !names.includes('duckdb.node')) {
    throw new Error(`sharp.node / skia.node / duckdb.node missing from the extraction: ${names.join(', ')}`)
  }
  if (process.platform === 'win32' && !names.includes('icudtl.dat')) {
    throw new Error(`icudtl.dat missing from the extraction (win32 skia crashes without it): ${names.join(', ')}`)
  }
  if (!names.every(isExpectedNativeFile)) {
    throw new Error(`unexpected files in the extraction: ${names.join(', ')}`)
  }
  return `${names.length} flat files: ${names.join(', ')}`
}

function checkNatives(binaryPath: string, cacheDir: string) {
  const expected = `SEA natives smoke passed: ${process.platform}-${process.arch}`
  const result = spawnSync(binaryPath, ['--smoke-natives'], {
    encoding: 'utf-8',
    timeout: NATIVES_TIMEOUT_MS,
    env: { ...scrubbedParentEnv(), KOBATO_CACHE_DIR: cacheDir },
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
 * `--smoke-worker` validates the full server config at import time (the pool
 * graph pulls in `@kobato/server/infra/config`) but never connects to anything, so
 * the same env the server boot gets is passed here. The `--config` points
 * at the temp cache dir — without it env loading would auto-create
 * `kobato.config.json` next to the binary and persist the throwaway
 * database path and smoke secrets into it.
 */
function checkWorker(binaryPath: string, env: Record<string, string>) {
  const expected = `SEA worker smoke passed: ${process.platform}-${process.arch}`
  const result = spawnSync(
    binaryPath,
    ['--config', join(env.KOBATO_CACHE_DIR, 'kobato.config.json'), '--smoke-worker'],
    {
      encoding: 'utf-8',
      timeout: NATIVES_TIMEOUT_MS,
      env: { ...scrubbedParentEnv(), ...env },
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
  // Windows delivers no SIGTERM — Node's kill maps to TerminateProcess,
  // so a non-zero forceful exit IS the expected outcome there (graceful
  // shutdown on win32 relies on console Ctrl+C, undeliverable to a
  // spawned child). The check still proves the process exits promptly.
  if (process.platform === 'win32') {
    return `terminated after ${elapsed}s (win32: SIGTERM maps to TerminateProcess)`
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
 * refactor can't false-fail the smoke. (Core line only.)
 */
async function checkNativesReuse() {
  const expectedCount = NATIVES_FILE_COUNT
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
      ssrPath = '/admin/signin'
      return '200 (instance already installed)'
    }
    throw new Error(
      `expected 303 → /admin/setup or 200, got ${res.status}${location ? ` (location: ${location})` : ''}`,
    )
  })

  let assetPath: string | null = null
  if (ssrPath !== null) {
    const pagePath = ssrPath
    await check(`GET ${pagePath} — admin SSR HTML`, async () => {
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

// ─── Core-line additions (plan stage 2): /api reachability + JWT flows ──

/**
 * `GET /api/content/v1/openapi.json` — the headless REST face must be
 * mounted and serve the generated OpenAPI document (phase 0.6 dual
 * mount). Runs against the seeded instance (settings hydrated).
 */
async function checkApiSpec(baseUrl: string) {
  await check('GET /api/content/v1/openapi.json — REST face reachable', async () => {
    const res = await fetchManual(`${baseUrl}/api/content/v1/openapi.json`)
    const contentType = res.headers.get('content-type') ?? ''
    if (res.status !== 200) {
      throw new Error(`expected 200, got ${res.status}`)
    }
    if (!contentType.includes('json')) {
      throw new Error(`unexpected content-type: ${contentType}`)
    }
    const body = await res.text()
    if (!body.includes('"/content/v1/')) {
      throw new Error('openapi.json does not list /content/v1/* paths')
    }
    return `200 ${contentType.split(';')[0]}, ${body.length} bytes`
  })
}

/**
 * One real anonymous content read over the REST face: `home` is a public
 * GET procedure — on a seeded (empty) instance it resolves an empty
 * listing with 200. Proves the OpenAPIHandler wire works end to end.
 */
async function checkApiContentRead(baseUrl: string) {
  await check('GET /api/content/v1/home — anonymous content read', async () => {
    const res = await fetchManual(`${baseUrl}/api/content/v1/home`)
    const contentType = res.headers.get('content-type') ?? ''
    if (res.status !== 200) {
      throw new Error(`expected 200, got ${res.status}`)
    }
    if (!contentType.includes('json')) {
      throw new Error(`unexpected content-type: ${contentType}`)
    }
    const body = await res.text()
    if (!body.includes('resolvedPosts')) {
      throw new Error('home response does not carry resolvedPosts')
    }
    return `200 ${contentType.split(';')[0]}, ${body.length} bytes`
  })
}

/**
 * The `api_key` seed for the JWT flows: one Ed25519 keypair generated in
 * the smoke, the public half registered (the same shape
 * `registerApiKey` writes — the smoke seeds via SQL because registering
 * over HTTP needs an admin session).
 */
function seedFrontendApiKey(databasePath: string, { id, publicKeyPem }: { id: string; publicKeyPem: string }): string {
  const db = new DatabaseSync(databasePath)
  try {
    db.prepare(
      `INSERT INTO "api_key" ("id", "name", "public_key", "scopes", "created_at")
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT ("id") DO NOTHING`,
    ).run(id, 'SEA smoke key', publicKeyPem, JSON.stringify(['content:write']), Date.now())
  } finally {
    db.close()
  }
  return id
}

/** Read `last_used_at` (epoch ms, NULL when the JWT never verified). */
function readApiKeyLastUsed(databasePath: string, id: string): number | null {
  const db = new DatabaseSync(databasePath)
  try {
    // node:sqlite `get` returns `unknown`; the SELECT projects exactly these columns.
    const row = unsafeCast<{ last_used_at: number | null } | undefined>(
      db.prepare(`SELECT "last_used_at" FROM "api_key" WHERE "id" = ?`).get(id),
    )
    return row?.last_used_at ?? null
  } finally {
    db.close()
  }
}

function signFrontendJwt(privateKeyPem: string, { iss, exp }: { iss: string; exp: number }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss, scope: ['content:write'], exp })).toString('base64url')
  const data = Buffer.from(`${header}.${payload}`, 'utf8')
  const signature = sign(null, data, privateKeyPem)
  return `${header}.${payload}.${signature.toString('base64url')}`
}

/**
 * The anonymous CSRF double-submit flow: GET a safe page to receive the
 * `__csrf` cookie, then derive the stateless token
 * (HMAC(sessionSecret, cookie) — `deriveStatelessCsrfToken`) and send it
 * as `x-csrf-token` on the POST. The smoke knows the sessionSecret it
 * generated for this run.
 */
async function acquireCsrf(baseUrl: string, sessionSecret: string): Promise<{ cookie: string; token: string }> {
  const res = await fetchManual(`${baseUrl}/health`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(new RegExp(`__csrf=([a-f0-9]{64})`))
  if (!match) {
    throw new Error(`no __csrf cookie minted by GET /health: ${setCookie || '(no set-cookie)'}`)
  }
  const cookieValue = match[1]!
  return { cookie: cookieValue, token: createHmac('sha256', sessionSecret).update(cookieValue).digest('hex') }
}

/**
 * Frontend-key JWT positive/negative flows (phase 0.6 credential model).
 * The observable is `api_key.last_used_at`: `verifyFrontendJwt` bumps it
 * exactly when a Bearer token verifies. The smoke posts to a
 * frontendKeyAuth-gated write procedure (`comments.reply` — the auth
 * middleware runs before the handler, so the response status is
 * irrelevant) and asserts the DB side effect:
 *   - positive: a valid EdDSA JWT (registered key) → last_used_at set;
 *   - negative: the same token with a flipped signature byte →
 *     last_used_at unchanged.
 *
 * The RPC wire path is router-relative using the procedure KEY (`/rpc/comments/replyComment` — the oRPC wire names procedures by their router key, while the `/content/v1/...` strings in the controllers are the REST face's route paths); the oRPC body rides the `{ "json": <input> }` envelope (#/_helpers/rpc-call).
 */
async function checkFrontendJwtFlows(
  baseUrl: string,
  databasePath: string,
  sessionSecret: string,
  keyId: string,
  privateKeyPem: string,
) {
  const replyUrl = `${baseUrl}/rpc/comments/replyComment`
  const input = {
    page_key: '00000000-0000-0000-0000-000000000000',
    name: 'SEA Smoke',
    email: 'smoke@kobato.local',
    // Comment-dialect Lexical body (the R5 migration retired the PT
    // shape; a PT body fails input validation before the auth
    // middleware's last_used_at bump).
    body: {
      root: {
        direction: null,
        format: '',
        indent: 0,
        version: 1,
        type: 'root',
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            version: 1,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [
              { detail: 0, format: 0, mode: 'normal', style: '', text: 'sea smoke', type: 'text', version: 1 },
            ],
          },
        ],
      },
    },
    subtitle: '',
  }
  const csrf = await acquireCsrf(baseUrl, sessionSecret)
  const headers = {
    cookie: `__csrf=${csrf.cookie}`,
    'x-csrf-token': csrf.token,
    'content-type': 'application/json',
  }
  const post = (token: string) =>
    fetch(replyUrl, {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${token}` },
      body: JSON.stringify({ json: input }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })

  await check('frontend-key JWT positive flow (valid EdDSA token)', async () => {
    const before = readApiKeyLastUsed(databasePath, keyId)
    const token = signFrontendJwt(privateKeyPem, { iss: keyId, exp: Math.floor(Date.now() / 1000) + 120 })
    const res = await post(token)
    // The auth middleware runs before the handler — the response may be
    // any status (input/rate-limit/not-found); only the DB effect proves
    // the key verified.
    const after = readApiKeyLastUsed(databasePath, keyId)
    if (after === null || after === before) {
      throw new Error(
        `last_used_at not bumped by a valid JWT (HTTP ${res.status}, before=${before ?? 'null'} after=${after ?? 'null'})`,
      )
    }
    return `HTTP ${res.status}, last_used_at bumped`
  })

  await check('frontend-key JWT negative flow (tampered signature)', async () => {
    const before = readApiKeyLastUsed(databasePath, keyId)
    const token = signFrontendJwt(privateKeyPem, { iss: keyId, exp: Math.floor(Date.now() / 1000) + 120 })
    // Tamper the FIRST character of the signature segment: base64url's
    // final character carries pad bits, so flipping the last char can
    // decode to the same byte (when the last byte's low 2 bits are 00 —
    // `A`↔`B` differ only in pad) and the "tampered" token would still
    // verify. The first char always encodes real signature bits.
    const signature = token.split('.')[2]!
    const flippedSig = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
    const flipped = token.slice(0, token.length - signature.length) + flippedSig
    const res = await post(flipped)
    const after = readApiKeyLastUsed(databasePath, keyId)
    if (after !== before) {
      throw new Error(`last_used_at changed after a tampered JWT (before=${before ?? 'null'} after=${after ?? 'null'})`)
    }
    return `HTTP ${res.status}, last_used_at unchanged`
  })
}

// ─── Core managed lifecycle ──────────────────────────────

/** Returns a cleanup callback; the caller runs it after the summary/log dump. */
async function runManagedCore(binaryPath: string) {
  await ensureBinaryExists(binaryPath)
  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  serverLogPath = join(dirs.root, 'server.log')

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    database: ${databases.database}`)
  console.log(`    temp dir: ${dirs.root}`)

  const sessionSecret = randomBytes(32).toString('hex')
  const env = {
    storage__database: databases.database,
    storage__analyticsDatabase: databases.analytics,
    security__sessionSecret: sessionSecret,
    security__encryptionKey: randomBytes(32).toString('hex'),
    storage__data: dirs.data,
    KOBATO_CACHE_DIR: dirs.cache,
    NODE_ENV: 'production',
  }

  let server = none<SmokeServer>()
  try {
    await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath, 'core'))
    await check('kobato --version', () => checkVersion(binaryPath, 'core'))
    await check('kobato --smoke-natives (sharp + canvas + duckdb)', () => checkNatives(binaryPath, dirs.cache))
    await check('natives extraction is the flat dynamic-library set', () => checkNativesLayout(dirs.cache))

    {
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
          if (converged.database !== databases.database) {
            throw new Error(`storage.database is ${converged.database}, expected ${databases.database}`)
          }
          return 'storage.database + sessionSecret persisted'
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
      //
      // The frontend-key JWT flows need a registered key: generate an
      // Ed25519 keypair here and seed the public half into `api_key`
      // (alongside the admin/settings seed — the server is stopped, no
      // WAL contention).
      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      })
      const keyId = '00000000-0000-0000-0000-0000000000jwt'
      const seeded =
        booted &&
        (await check('seed admin + core settings + frontend key (SQL)', async () => {
          await seedInstalledInstance(databases.database, {
            email: SEED_ADMIN_EMAIL,
            passwordHash: SEED_ADMIN_PASSWORD,
          })
          seedFrontendApiKey(databases.database, { id: keyId, publicKeyPem: publicKey })
          return 'admin row + blog.general/blog.assets + api_key inserted'
        }))
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
          // Public SSR moved to the frontend line — the core smoke checks
          // the ADMIN app's unauthenticated SSR page instead (public URL
          // coverage lives in the frontend smoke).
          await check('GET /admin/signin — admin SSR HTML (installed)', async () => {
            const body = await fetchSsrPage(baseUrl, '/admin/signin')
            return `200 text/html, ${body.length} bytes`
          })
          await checkApiSpec(baseUrl)
          await checkApiContentRead(baseUrl)
          await checkFrontendJwtFlows(baseUrl, databases.database, sessionSecret, keyId, privateKey)
          await checkCalendar(baseUrl, { optional: false })
          // Page-view tracking + the DuckDB round-trip moved OFF the core
          // line with the split: `trackPageView` fires inside the core
          // Content API's detail procedure (`loadPublicDetailData`) when
          // the frontend's SSR loaders call it over HTTP — the core
          // binary itself serves no public pages, so the CORE line has
          // no page to render and nothing to record. The full round trip
          // (frontend SSR → core procedure → analytics sidecar) is the
          // frontend smoke's concern with `--core-url`. The analytics
          // sidecar itself is still exercised at boot (opened + DDL
          // applied — see the server
          // log's analytics.batcher lines).
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
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ─── Frontend managed lifecycle ──────────────────────────

/**
 * Frontend line managed mode: the public SSR service against per-run temp
 * files. The frontend binary carries no natives and no image worker, so
 * there are no --smoke-natives/--smoke-worker checks. Its SSR graph has no
 * database and no shared config graph of its own (headless); content loads
 * over HTTP from core, so the seeded-restart phase exists only to prove the
 * binary boots with a converged environment (the `/health` probe).
 *
 * Optional core connectivity: `--core-url <url>` (or
 * KOBATO_SMOKE_CORE_URL) makes the smoke (a) pass CORE_API_URL to the
 * child and assert the /health echo, (b) render `/` through the core
 * Content API and fetch the core /health itself. Absent a URL the SSR and
 * connectivity checks SKIP — a frontend without a configured core has
 * nothing to render.
 */
async function runManagedFrontend(binaryPath: string, coreUrl: string | null) {
  await ensureBinaryExists(binaryPath)
  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  serverLogPath = join(dirs.root, 'server.log')

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    database: ${databases.database}`)
  console.log(`    temp dir: ${dirs.root}`)

  const env = {
    storage__database: databases.database,
    storage__analyticsDatabase: databases.analytics,
    security__sessionSecret: randomBytes(32).toString('hex'),
    security__encryptionKey: randomBytes(32).toString('hex'),
    storage__data: dirs.data,
    KOBATO_CACHE_DIR: dirs.cache,
    NODE_ENV: 'production',
    ...(coreUrl !== null ? { CORE_API_URL: coreUrl } : {}),
  }

  let server = none<SmokeServer>()
  try {
    await check('frontend binary within the compression budget', () => checkBinarySize(binaryPath, 'frontend'))
    await check('kobato-frontend --version', () => checkVersion(binaryPath, 'frontend'))

    const booted = await check('frontend boot (no install gate)', async () => {
      server = await bootServer(binaryPath, dirs, env, serverLogPath ?? fail('serverLogPath unset'))
      console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
      const started = Date.now()
      server.healthResponse = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
      if (server.healthResponse.status !== 200) {
        throw new Error(`expected 200, got ${server.healthResponse.status}`)
      }
      const body = await server.healthResponse.text()
      if (coreUrl !== null && !body.includes(coreUrl)) {
        throw new Error(`/health does not echo CORE_API_URL ${coreUrl}: ${body}`)
      }
      return `HTTP 200 after ${((Date.now() - started) / 1000).toFixed(1)}s on port ${server.port}`
    })

    if (booted && server !== null) {
      const bootedServer = server
      await check('SIGTERM clean shutdown (fresh boot)', () => checkShutdown(bootedServer))
      // Same stream-flush wait as the core line: the log stream's close
      // event is still in flight when the next phase starts.
      await Promise.race([bootedServer.logClosed, sleep(2_000)])
    }

    // Restart phase: prove the binary boots twice under the same
    // per-run env (the headless frontend has no database and no config
    // graph of its own — the temp-DB provisioning below is inert, kept
    // because the shared lifecycle provisions it and the second boot is
    // the real assertion). The `/health` probe plus (with --core-url) the
    // SSR render cover the service behavior.
    const provisioned = await check('provision temp DB schema (repo migration SQL)', () =>
      applyMigrationsSql(databases.database),
    )
    const seeded =
      provisioned &&
      (await check('seed admin + core settings (SQL)', () =>
        seedInstalledInstance(databases.database, {
          email: SEED_ADMIN_EMAIL,
          passwordHash: SEED_ADMIN_PASSWORD,
        }),
      ))
    if (seeded) {
      const fileOnlyEnv = {
        KOBATO_CACHE_DIR: dirs.cache,
        NODE_ENV: 'production',
        ...(coreUrl !== null ? { CORE_API_URL: coreUrl } : {}),
      }
      const restarted = await check('frontend restart (seeded install, config file only)', async () => {
        server = await bootServer(binaryPath, dirs, fileOnlyEnv, serverLogPath ?? fail('serverLogPath unset'))
        console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
        const started = Date.now()
        server.healthResponse = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
        return `HTTP ${server.healthResponse.status} after ${((Date.now() - started) / 1000).toFixed(1)}s on port ${server.port}`
      })

      if (restarted && server !== null) {
        const seededServer = server
        const baseUrl = `http://127.0.0.1:${seededServer.port}`

        if (coreUrl !== null) {
          // Headless form: `/` renders through the core Content API, so the
          // SSR check needs a live core (`--core-url`). Absent a URL the
          // check SKIPs — the frontend binary has nothing to render without
          // a configured core, and a misconfigured deployment is surfaced
          // by /health (coreApiUrl: null) + the loud loader failure instead.
          let assetPath: string | null = null
          await check('GET / — public SSR HTML (headless, via core)', async () => {
            const body = await fetchSsrPage(baseUrl, '/')
            const match = body.match(/(?:href|src)="(\/assets\/[^"]+?\.js)"/)
            if (!match) {
              throw new Error('no /assets/*.js reference found in the SSR HTML')
            }
            assetPath = match[1] ?? null
            return `200 text/html, ${body.length} bytes, first asset ${assetPath ?? ''}`
          })

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
        } else {
          await check('GET / — public SSR HTML (headless, via core)', async () => {
            return 'SKIP — no --core-url / KOBATO_SMOKE_CORE_URL given (SSR needs a live core)'
          })
        }

        if (coreUrl !== null) {
          await check(`GET ${coreUrl}/health — core reachable (CORE_API_URL)`, async () => {
            const res = await fetchManual(`${coreUrl}/health`)
            if (res.status !== 200 && res.status !== 303) {
              throw new Error(`expected 200/303, got ${res.status}`)
            }
            return `${res.status} (core answers)`
          })
        } else {
          await check('GET <core>/health — core connectivity (--core-url)', async () => {
            // The headless frontend calls core over HTTP for every content
            // read; the connectivity check is a deployment wiring assertion
            // and needs an explicit core URL.
            return 'SKIP — no --core-url / KOBATO_SMOKE_CORE_URL given'
          })
        }

        await check('SIGTERM clean shutdown (seeded install)', () => checkShutdown(seededServer))
        // Same stream-flush wait as the core line — buffered log writes
        // outlive the process otherwise.
        await Promise.race([seededServer.logClosed, sleep(2_000)])
      }
    }
  } finally {
    if (server !== null && !server.exitState.exited) {
      server.child.kill('SIGKILL')
    }
  }

  return async () => {
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Binary-only mode: the service-free checks (CLI flags, natives extraction
 * and loading, the sharp worker pool — core line; version + budget only
 * for the frontend line). `--smoke-worker` validates the full server
 * config at import time but never connects, so temp paths satisfy it.
 * Returns a cleanup callback for the temp dirs (natives cache included).
 */
async function runBinaryOnly(binaryPath: string, target: SeaTarget) {
  await ensureBinaryExists(binaryPath)
  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    temp dir: ${dirs.root}`)

  await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath, target))
  await check(`${versionPrefix(target)} --version`, () => checkVersion(binaryPath, target))
  if (target === 'core') {
    await check('kobato --smoke-natives (sharp + canvas + duckdb)', () => checkNatives(binaryPath, dirs.cache))
    await check('natives extraction is the flat dynamic-library set', () => checkNativesLayout(dirs.cache))
    await check('kobato --smoke-worker (sharp worker pool)', () =>
      checkWorker(binaryPath, {
        storage__database: databases.database,
        storage__analyticsDatabase: databases.analytics,
        security__sessionSecret: randomBytes(32).toString('hex'),
        security__encryptionKey: randomBytes(32).toString('hex'),
        storage__data: dirs.data,
        KOBATO_CACHE_DIR: dirs.cache,
        NODE_ENV: 'production',
      }),
    )
  }

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

/**
 * The first positional (non-flag) argument — the binary path after
 * `--target <t>` / `--core-url <url>` etc. Skips the values of known
 * flag arguments so `--target frontend dist-sea/kobato-frontend` resolves
 * the binary correctly.
 */
function firstPositionalArg(args: readonly string[]) {
  const skipNext = new Set(['--target', '--codec', '--core-url', '--external', '--binary-only'])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      if (skipNext.has(arg)) {
        i++
      }
      continue
    }
    return arg
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const target = resolveSeaTarget(args)
  // The core URL for the frontend connectivity check: `--core-url <url>`
  // arg, else KOBATO_SMOKE_CORE_URL env. Absent → SKIP.
  const coreUrlArgIndex = args.indexOf('--core-url')
  const coreUrlRaw = coreUrlArgIndex !== -1 ? args[coreUrlArgIndex + 1] : (process.env.KOBATO_SMOKE_CORE_URL ?? null)
  const coreUrl = coreUrlRaw !== null && coreUrlRaw !== '' ? normalizeBaseUrl(coreUrlRaw) : null

  let cleanup: (() => Promise<void>) | null = null

  if (args.includes('--external')) {
    const externalIndex = args.indexOf('--external')
    const baseUrlRaw = args[externalIndex + 1]
    if (!baseUrlRaw) {
      fail('Usage: node scripts/sea/smoke.ts [--target core|frontend] --external <baseUrl> [--core-url <url>]')
    }
    const baseUrl = normalizeBaseUrl(baseUrlRaw)
    console.log(`==> SEA smoke (external: ${baseUrl}, target: ${target})`)
    if (target === 'frontend') {
      await check('GET /health — frontend answers', async () => {
        const res = await fetchManual(`${baseUrl}/health`)
        if (res.status !== 200) {
          throw new Error(`expected 200, got ${res.status}`)
        }
        return '200'
      })
      await check('GET / — public SSR HTML', async () => {
        const body = await fetchSsrPage(baseUrl, '/')
        return `200 text/html, ${body.length} bytes`
      })
      if (coreUrl !== null) {
        await check(`GET ${coreUrl}/health — core reachable (CORE_API_URL)`, async () => {
          const res = await fetchManual(`${coreUrl}/health`)
          if (res.status !== 200 && res.status !== 303) {
            throw new Error(`expected 200/303, got ${res.status}`)
          }
          return `${res.status} (core answers)`
        })
      }
    } else {
      await runHttpChecks(baseUrl, null)
      // No seeding in external mode — the database belongs to someone else.
      await checkCalendar(baseUrl, { optional: true })
    }
  } else if (args.includes('--binary-only')) {
    const binaryIndex = args.indexOf('--binary-only')
    const binaryPath = args[binaryIndex + 1] ? resolvePath(args[binaryIndex + 1]) : seaBinaryPath(target)
    console.log(`==> SEA smoke (binary-only, target: ${target})`)
    cleanup = await runBinaryOnly(binaryPath, target)
  } else {
    const positional = firstPositionalArg(args)
    const binaryPath = positional !== null ? resolvePath(positional) : seaBinaryPath(target)
    console.log(`==> SEA smoke (managed, target: ${target})`)
    cleanup = target === 'frontend' ? await runManagedFrontend(binaryPath, coreUrl) : await runManagedCore(binaryPath)
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
  // Set the exit code and let the process end NATURALLY — an explicit
  // process.exit() would tear the loop down while async handles are
  // still in flight (e.g. the server log stream's close event), which
  // trips a libuv assertion on win32 (`src\win\async.c:94,
  // UV_HANDLE_CLOSING`) after an otherwise fully-passing run. e2e.ts
  // makes the same choice deliberately.
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
