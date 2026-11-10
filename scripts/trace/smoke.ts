// `pnpm run trace:smoke` — real end-to-end OpenObserve smoke.
// Brings up a throwaway single-container OpenObserve, provisions the same
// retention/pipeline/dashboards as `trace:init`, boots the REAL DEV server
// (react-router dev) with a throwaway config, drives Chromium through public
// pages, an oRPC call, an SPA navigation and a sanitized error, then queries
// OpenObserve for the actual stored traces/metrics/RUM/server logs. Finally it
// stops OpenObserve, proves the site keeps working, and checks that no outage
// data is replayed after the restart. Server logs must land in the independent
// `kobato_logs` stream with the closed projected columns and correlate with the
// same request's `http.server` span by trace_id AND span_id.
// Everything is synthetic and loopback-only. Ordinary `pnpm test` never runs
// this file; it requires Docker and Playwright.

import type { BrowserContext, Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

import { chromium } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'

import type { O2Context, TraceState } from './lib.ts'

import { TRACE_METRIC_STREAMS } from '../../src/shared/contracts/trace-metrics.ts'
import { RUM_PRIVACY_FUNCTION_NAME, RUM_PRIVACY_PIPELINE_NAME } from '../../src/shared/contracts/trace-pipeline.ts'
import { unsafeCast } from '../../src/shared/utils/unsafe-cast.ts'
import { E2eClient, getAdminCsrfToken, loginAdmin } from '../../tests/_helpers/e2e-client.ts'
import { callE2eRpc } from '../../tests/_helpers/e2e-rpc.ts'
import { lexicalBodyWith, lexicalParagraph } from '../../tests/_helpers/lexical.ts'
import {
  buildState,
  docker,
  ensureDocker,
  fail,
  generateFixture,
  generatePassword,
  getRumToken,
  listDashboards,
  listStreams,
  log,
  LOG_STREAM,
  o2Context,
  o2Json,
  observabilityDashboardPath,
  RETENTION_DAYS,
  search,
  upsertFunction,
  startOpenObserve,
  stopOpenObserve,
  waitForOpenObserve,
  warn,
} from './lib.ts'
import { applyRetention } from './provision.ts'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const BOOT_TIMEOUT_MS = 120_000
const DATA_TIMEOUT_MS = 60_000
const SHUTDOWN_TIMEOUT_MS = 20_000

interface Check {
  name: string
  ok: boolean
  detail: string
}

const checks: Check[] = []

async function check(name: string, fn: () => string | undefined | Promise<string | undefined>): Promise<boolean> {
  try {
    const detail = (await fn()) ?? ''
    checks.push({ name, ok: true, detail })
    log(`  PASS  ${name}${detail === '' ? '' : ` — ${detail}`}`)
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    checks.push({ name, ok: false, detail })
    log(`  FAIL  ${name} — ${detail}`)
    return false
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function pickFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('listen returned no port')))
        return
      }
      server.close(() => resolvePort(address.port))
    })
  })
}

function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.includes('__') || key.startsWith('KOBATO_')) {
      continue
    }
    if (key === 'VITEST' || key === 'NODE_ENV') {
      continue
    }
    env[key] = value
  }
  return env
}

interface DevServer {
  child: ChildProcess
  port: number
  logPath: string
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

async function bootDevServer(configPath: string, port: number, logPath: string): Promise<DevServer> {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'react-router',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
      '--logLevel',
      'warn',
    ],
    {
      cwd: REPO_ROOT,
      env: { ...scrubbedEnv(), KOBATO_CONFIG_FILE: configPath, CI: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const stream = createWriteStream(logPath, { flags: 'w' })
  child.stdout?.pipe(stream)
  child.stderr?.pipe(stream)
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }))
  })
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`DEV server exited during boot (code ${child.exitCode}); see ${logPath}`)
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) {
        return { child, port, logPath, exited }
      }
    } catch {
      // not listening yet
    }
    await sleep(400)
  }
  throw new Error(`DEV server did not answer /health within ${BOOT_TIMEOUT_MS / 1000}s; see ${logPath}`)
}

async function stopDevServer(server: DevServer): Promise<void> {
  if (server.child.exitCode !== null) {
    return
  }
  server.child.kill('SIGTERM')
  const result = await Promise.race([server.exited, sleep(SHUTDOWN_TIMEOUT_MS).then(() => 'timeout' as const)])
  if (result === 'timeout') {
    server.child.kill('SIGKILL')
    fail(`DEV server did not stop within ${SHUTDOWN_TIMEOUT_MS / 1000}s`)
  }
}

function seedAdmin(databasePath: string, email: string, password: string, origin: string): void {
  const year = new Date().getFullYear()
  const general = JSON.stringify({
    title: 'Kobato Trace Smoke',
    description: 'Synthetic OpenObserve smoke instance',
    // The site must point at the running DEV origin: a cover-less post's
    // default OG cover is fetched from `<website>/images/open-graph.png`.
    website: origin,
    keywords: [],
    author: { name: 'Smoke Admin', email, url: origin },
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
    ).run(email, bcrypt.hashSync(password, 4), now, now)
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.general', ?, ?, NULL), ('blog.assets', ?, ?, NULL)
       ON CONFLICT ("scope") DO NOTHING`,
    ).run(general, now, assets, now)
  } finally {
    db.close()
  }
}

interface SmokeFixtures {
  adminEmail: string
  adminPassword: string
  slug: string
  title: string
  search: string
  email: string
  token: string
  sqlValue: string
  rawUrl: string
  error: string
}

function fixtures(): SmokeFixtures {
  const id = randomBytes(5).toString('hex')
  return {
    adminEmail: generateFixture('smoke-admin') + '@example.invalid',
    adminPassword: generatePassword(),
    slug: generateFixture('smoke-secret-slug'),
    title: `Smoke post ${id}`,
    search: generateFixture('smoke-secret-search'),
    email: generateFixture('smoke-secret-email') + '@example.invalid',
    token: `tok_${randomBytes(16).toString('hex')}`,
    sqlValue: `' OR 1=1 -- ${generateFixture('smoke-secret-sql')}`,
    rawUrl: `https://signed.example.invalid/private/${randomBytes(8).toString('hex')}?sig=${randomBytes(8).toString('hex')}`,
    error: generateFixture('smoke-secret-error'),
  }
}

/** Every synthetic fixture string, labelled by field so a failure never echoes a secret. */
function fixtureNeedles(fx: SmokeFixtures): Array<{ field: string; value: string }> {
  return Object.entries(fx).map(([field, value]) => ({ field, value: String(value) }))
}

async function writeDevConfig(path: string, port: number, dataDir: string): Promise<void> {
  // Tracing has no config-file surface: the smoke configures the `observability`
  // settings section through the real admin RPC below.
  const config = {
    server: { host: '127.0.0.1', port, loggingLevel: 'info' },
    security: {
      sessionSecret: randomBytes(48).toString('hex'),
      encryptionKey: randomBytes(48).toString('hex'),
      trustedProxies: [],
    },
    storage: { data: dataDir, database: '', analyticsDatabase: '', defaultFont: '' },
  }
  // Synthetic fixtures deliberately never reach the config file.
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
}

interface ObservabilityStatus {
  runtime: { phase: 'disabled' | 'unverified' | 'invalid' | 'running' | 'failed'; lastError: string | null }
  verified: boolean
  provisioned: boolean
  provisionedCurrent: boolean
  version: string | null
}

interface ObservabilityTestConnectionResult {
  ok: true
  version: string | null
  organization: 'created' | 'exists'
  provision:
    | {
        status: 'succeeded'
        organization: 'created' | 'exists'
        rumToken: 'created' | 'exists'
        pipeline: 'installed'
        dashboards: number
        provisionedFingerprint: string
      }
    | { status: 'failed'; descriptor: { messageKey: string } }
}

/**
 * Save a sparse `observability` patch through the REAL admin settings
 * procedure (`POST /rpc/admin/settings/update`). This is the same call the
 * settings panel makes, so the smoke exercises the write schema, the secret
 * encryption, and the section-change handler.
 */
async function saveObservabilitySettings(session: AdminSession, patch: Record<string, unknown>): Promise<void> {
  const result = await callE2eRpc<{ section: unknown; warnings: string[] }>(
    session.client,
    '/admin/settings/update',
    { section: 'observability', payload: { observability: patch } },
    session.csrfToken,
  )
  assert(result.status === 200, `observability settings save failed (${result.status})`)
  assert(result.json.warnings.length === 0, `observability save returned warnings: ${result.json.warnings.join('; ')}`)
}

/** Read the read-only status projection (`GET /rpc/admin/observability/status`). */
async function readObservabilityStatus(session: AdminSession): Promise<ObservabilityStatus> {
  // oRPC's GET transport carries the serialized request envelope in `data`,
  // not the bare input: `{"json":{}}` (empty query input).
  const data = encodeURIComponent(JSON.stringify({ json: {} }))
  const res = await session.client.get(`/rpc/admin/observability/status?data=${data}`, {
    headers: { accept: 'application/json', 'x-csrf-token': session.csrfToken },
  })
  assert(res.status === 200, `observability status returned ${res.status}`)
  const body = unsafeCast<{ json: ObservabilityStatus }>(await res.json())
  return body.json
}

/** The runtime apply is async (serialized queue) — poll until the phase settles. */
async function waitForRuntimePhase(
  session: AdminSession,
  expected: ObservabilityStatus['runtime']['phase'],
  timeoutMs = 90_000,
): Promise<ObservabilityStatus> {
  const deadline = Date.now() + timeoutMs
  let last: ObservabilityStatus | null = null
  while (Date.now() < deadline) {
    last = await readObservabilityStatus(session).catch(() => null)
    if (last?.runtime.phase === expected) {
      return last
    }
    await sleep(750)
  }
  throw new Error(
    `observability runtime did not reach ${expected} within ${timeoutMs / 1000}s (last=${last?.runtime.phase ?? 'unreadable'}, error=${last?.runtime.lastError ?? 'none'})`,
  )
}

/**
 * Configure observability exactly as an admin would: save the connection
 * fields, test the connection (which verifies the fingerprint AND provisions
 * the RUM token / privacy pipeline / dashboards), wait for the runtime to
 * start, then flip the reporting switches (a runtime-fingerprint change that
 * keeps the verified connection) and wait for the browser gate.
 */
async function configureObservability(
  session: AdminSession,
  state: TraceState,
  origin: string,
): Promise<ObservabilityTestConnectionResult> {
  await saveObservabilitySettings(session, {
    enabled: true,
    endpoint: state.endpoint,
    organization: state.organization,
    username: state.adminEmail,
    password: state.adminPassword,
    sampleRate: 1,
    includeRedactedSql: false,
  })

  const test = await callE2eRpc<ObservabilityTestConnectionResult>(
    session.client,
    '/admin/observability/testConnection',
    {},
    session.csrfToken,
  )
  assert(test.status === 200, `observability connection test returned ${test.status}`)
  assert(test.json.ok === true, 'observability connection test did not report ok')
  assert(
    test.json.provision.status === 'succeeded',
    `auto-provision failed: ${test.json.provision.status === 'failed' ? test.json.provision.descriptor.messageKey : 'unknown'}`,
  )
  assert(
    test.json.provision.dashboards >= 4,
    `expected at least 4 provisioned dashboards, got ${test.json.provision.dashboards}`,
  )

  const running = await waitForRuntimePhase(session, 'running')
  assert(running.verified, 'runtime is running but the connection is not verified')
  assert(running.provisioned && running.provisionedCurrent, 'provisioned assets are missing or stale')

  // Switch flips AFTER verification: the connection fingerprint excludes them,
  // so the runtime restarts without losing the verified state.
  await saveObservabilitySettings(session, {
    logs: { enabled: true },
    frontend: { enabled: true, sessionSampleRate: 100 },
  })
  await waitForRuntimePhase(session, 'running')
  await waitForRumStatus(origin, true, 60_000)
  return test.json
}

interface AdminSession {
  client: E2eClient
  csrfToken: string
}

interface StagedPost {
  id: string
  slug: string
}

async function stagePost(origin: string, fx: SmokeFixtures): Promise<{ session: AdminSession; post: StagedPost }> {
  const client = new E2eClient(origin)
  const { res } = await loginAdmin(client, {
    baseUrl: origin,
    adminEmail: fx.adminEmail,
    adminPassword: fx.adminPassword,
  })
  assert(res.status === 302, `admin sign-in returned ${res.status}, expected 302`)
  const csrf = await getAdminCsrfToken(client)
  const upsert = await callE2eRpc<{ post: { id: string; slug: string } }>(
    client,
    '/admin/posts/upsertMeta',
    {
      title: fx.title,
      summary: `Synthetic summary ${fx.sqlValue}`,
      // Site-owned cover: the editor's OG preview asks the renderer for a card,
      // and a cover-less post's empty cover is not renderable.
      cover: '/images/open-graph.png',
      slug: fx.slug,
      published: true,
      publishedAt: new Date().toISOString(),
      contentLanguage: 'en',
      commentsEnabled: false,
    },
    csrf,
  )
  assert(upsert.status === 200, `post upsert failed (${upsert.status})`)
  const body = lexicalBodyWith([lexicalParagraph(`Synthetic body. ${fx.email} ${fx.token} ${fx.rawUrl}`)])
  const draft = await callE2eRpc<{ status: string }>(
    client,
    '/admin/posts/saveDraft',
    { id: upsert.json.post.id, body },
    csrf,
  )
  assert(draft.status === 200 && draft.json.status === 'saved', `draft save failed (${draft.status})`)
  const published = await callE2eRpc<{ status: string }>(
    client,
    '/admin/posts/publishLatest',
    { id: upsert.json.post.id, body, publishedAt: new Date().toISOString() },
    csrf,
  )
  assert(published.status === 200 && published.json.status === 'saved', `publish failed (${published.status})`)
  return { session: { client, csrfToken: csrf }, post: upsert.json.post }
}

/** Stage a second post that becomes due during the run, so the scheduler fires
 *  the real `content.scheduled-publish` job and emits a `job.run` span. */
async function stageScheduledPost(session: AdminSession, fx: SmokeFixtures): Promise<string> {
  const slug = `${fx.slug}-scheduled`
  const publishedAt = new Date(Date.now() + 8000).toISOString()
  const result = await callE2eRpc<{ post: StagedPost }>(
    session.client,
    '/admin/posts/upsertMeta',
    {
      title: `Scheduled smoke ${fx.search}`,
      summary: 'Scheduled content used by the trace smoke job check.',
      slug,
      published: true,
      publishedAt,
      contentLanguage: 'en',
      commentsEnabled: false,
    },
    session.csrfToken,
  )
  assert(result.status === 200, `scheduled post upsert failed (${result.status})`)
  const body = lexicalBodyWith([lexicalParagraph('Scheduled synthetic body for the job.run smoke check.')])
  const draft = await callE2eRpc<{ status: string }>(
    session.client,
    '/admin/posts/saveDraft',
    { id: result.json.post.id, body },
    session.csrfToken,
  )
  assert(draft.status === 200 && draft.json.status === 'saved', `scheduled draft save failed (${draft.status})`)
  const published = await callE2eRpc<{ status: string }>(
    session.client,
    '/admin/posts/publishLatest',
    { id: result.json.post.id, body, publishedAt },
    session.csrfToken,
  )
  assert(
    published.status === 200 && published.json.status === 'saved',
    `scheduled publish failed (${published.status})`,
  )
  return slug
}

async function makeLargeJpeg(): Promise<Buffer> {
  // Large enough for the inline DEV sharp transform to be a measurable slow
  // operation; a solid fill keeps the encoded upload far below the 8 MB cap.
  return sharp({
    create: { width: 6000, height: 4000, channels: 3, background: { r: 70, g: 110, b: 150 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

interface TraceRow {
  trace_id?: string
  span_id?: string
  reference_parent_span_id?: string
  operation_name?: string
  http_route?: string
  request_method?: string
  duration?: number
  status_code?: number
  http_response_status_code?: number
  span_status?: string
  start_time?: number
  _timestamp?: number
  service_name?: string
  [key: string]: unknown
}

interface RumRow {
  type?: string
  view_name?: string
  view_loading_type?: string
  resource_type?: string
  resource_url?: string
  resource_duration?: number
  _o2_trace_id?: string
  _o2_span_id?: string
  error_type?: string
  error_source?: string
  error_code?: string
  error_message?: string
  view_first_byte?: number
  view_largest_contentful_paint?: number
  view_cumulative_layout_shift?: number
  view_inp_us?: number | null
  [key: string]: unknown
}

interface LogRow {
  _timestamp?: number
  body?: string
  severity?: string
  severity_number?: number
  log_scope?: string
  http_request_method?: string
  http_response_status_code?: number
  service_name?: string
  service_version?: string
  deployment_environment?: string
  trace_id?: string
  span_id?: string
  [key: string]: unknown
}

async function waitForRows(
  ctx: O2Context,
  type: 'logs' | 'traces' | 'metrics',
  sql: string,
  startTimeMs: number,
  predicate: (rows: Array<Record<string, unknown>>) => boolean,
  timeoutMs = DATA_TIMEOUT_MS,
): Promise<Array<Record<string, unknown>>> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const result = await search(ctx, { type, sql, startTimeMs, size: 1000 })
      const rows = result.hits ?? []
      if (predicate(rows)) {
        return rows
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(2000)
  }
  throw new Error(`no matching ${type} data within ${timeoutMs / 1000}s${lastError === '' ? '' : ` (${lastError})`}`)
}

function stringifyAll(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify(rows)
}

async function scanForbiddenFields(ctx: O2Context, startTimeMs: number): Promise<string[]> {
  const rum = await search(ctx, {
    type: 'logs',
    sql: 'SELECT * FROM "_rumdata" LIMIT 1000',
    startTimeMs,
    size: 1000,
  })
  const keys = new Set<string>()
  for (const row of rum.hits ?? []) {
    for (const key of Object.keys(row)) {
      keys.add(key)
    }
  }
  const forbidden = [
    /^ip$/,
    /^geo_info/,
    /^user_agent/,
    /^device_/,
    /^usr_/,
    /^account_/,
    /^context_/,
    /^request_/,
    /^response_/,
    /^privacy_/,
    /^display_/,
    /^connectivity_/,
    /^container_/,
    /^action_/,
    /^graphql_/,
  ]
  // The VRL deliberately keeps these coarse identity dimensions (country/ISO
  // geo, UA/OS/device family) for `forward`-mode deployments; every finer
  // geo_info_*/user_agent_* field stays forbidden.
  const allowed = new Set([
    'geo_info_country',
    'geo_info_country_iso_code',
    'user_agent_user_agent_family',
    'user_agent_os_family',
    'user_agent_device_family',
  ])
  return [...keys].filter((key) => !allowed.has(key) && forbidden.some((pattern) => pattern.test(key))).sort()
}

async function processTreeRssKb(rootPid: number): Promise<number> {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf-8' })
  const children = new Map<number, number[]>()
  const rss = new Map<number, number>()
  for (const line of result.stdout.split('\n')) {
    const [pidText, ppidText, rssText] = line.trim().split(/\s+/)
    const pid = Number(pidText)
    const ppid = Number(ppidText)
    const rssKb = Number(rssText)
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rssKb)) {
      continue
    }
    rss.set(pid, rssKb)
    const list = children.get(ppid) ?? []
    list.push(pid)
    children.set(ppid, list)
  }
  let total = 0
  const queue = [rootPid]
  const seen = new Set<number>()
  while (queue.length > 0) {
    const pid = queue.pop()!
    if (seen.has(pid)) {
      continue
    }
    seen.add(pid)
    total += rss.get(pid) ?? 0
    queue.push(...(children.get(pid) ?? []))
  }
  return total
}

async function loginAsAdmin(page: Page, fx: SmokeFixtures): Promise<void> {
  await page.goto('/admin/signin', { waitUntil: 'networkidle' })
  await page.locator('#identifyForm input[name="email"]').fill(fx.adminEmail)
  await page.locator('#identifyForm button[type="submit"]').click()
  const password = page.locator('#loginForm input[name="password"]')
  await password.waitFor({ state: 'visible', timeout: 15_000 })
  await password.fill(fx.adminPassword)
  await Promise.all([
    page.waitForURL(/\/admin(?:\/|$)/, { timeout: 20_000 }),
    page.locator('#loginForm button[type="submit"]').click(),
  ])
}

async function uploadLargeImage(page: Page, jpeg: Buffer): Promise<number> {
  const base64 = jpeg.toString('base64')
  await page.goto('/admin', { waitUntil: 'networkidle' })
  const started = Date.now()
  await page.evaluate((encoded: string) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `
      import('/src/client/api/client.ts')
        .then(async (module) => {
          const bytes = Uint8Array.from(atob(${JSON.stringify(encoded)}), (char) => char.charCodeAt(0))
          const file = new File([bytes], 'trace-smoke.jpg', { type: 'image/jpeg' })
          const result = await module.orpc.admin.images.upload({ file, metadata: { kind: 'generic' } })
          window.__kobatoTraceImageUpload = Boolean(result.image)
        })
        .catch((error) => { window.__kobatoTraceImageUploadError = String(error) })
    `
    document.head.appendChild(script)
  }, base64)
  await page.waitForFunction(
    () =>
      Reflect.get(window, '__kobatoTraceImageUpload') === true ||
      Reflect.get(window, '__kobatoTraceImageUploadError') !== undefined,
    undefined,
    { timeout: 90_000 },
  )
  const error = await page.evaluate(() => {
    const value = Reflect.get(window, '__kobatoTraceImageUploadError')
    return typeof value === 'string' ? value : ''
  })
  assert(error === '', `image upload failed: ${error}`)
  return Date.now() - started
}

async function saveFromEditor(page: Page, postId: string, fx: SmokeFixtures): Promise<void> {
  await page.goto(`/editor/post/${postId}`, { waitUntil: 'networkidle' })
  const title = page.locator('input[aria-label*="标题"], input[aria-label*="title"]').first()
  await title.waitFor({ state: 'visible', timeout: 20_000 })
  await title.fill(`${fx.title} edited ${fx.search}`)
  const save = page.getByRole('button', { name: /保存草稿|Save draft/ }).first()
  const response = page.waitForResponse(
    (res) =>
      /\/rpc\/admin\/posts\/(?:upsertMeta|saveDraft)$/.test(new URL(res.url()).pathname) &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await save.click()
  const result = await response
  assert(result.status() === 200, `editor save returned HTTP ${result.status()}`)
}

interface BrowserSample {
  wallMs: number
  navigationMs: number
  lcpMs: number
}

async function measureBrowserNavigation(
  context: BrowserContext,
  origin: string,
  samples: number,
): Promise<BrowserSample[]> {
  const results: BrowserSample[] = []
  for (let index = 0; index < samples; index += 1) {
    const samplePage = await context.newPage()
    await samplePage.addInitScript(() => {
      Reflect.set(window, '__kobatoTraceLcp', 0)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          Reflect.set(window, '__kobatoTraceLcp', entry.startTime)
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    const started = Date.now()
    await samplePage.goto(origin, { waitUntil: 'load' })
    await samplePage.waitForTimeout(300)
    const measured = await samplePage.evaluate(() => {
      const lcp = Reflect.get(window, '__kobatoTraceLcp')
      const navigation = performance.getEntriesByType('navigation')[0]
      return {
        navigationMs: navigation?.duration ?? 0,
        lcpMs: typeof lcp === 'number' ? lcp : 0,
      }
    })
    results.push({ wallMs: Date.now() - started, navigationMs: measured.navigationMs, lcpMs: measured.lcpMs })
    await samplePage.close()
  }
  return results
}

async function ingestUnknownFieldRumEvent(
  state: TraceState,
  rumToken: string,
  fx: SmokeFixtures,
): Promise<{ viewId: string; traceId: string; applicationId: string }> {
  const viewId = randomBytes(12).toString('hex')
  const traceId = randomBytes(16).toString('hex')
  const applicationId = `privacy-probe-${viewId}`
  const payload = {
    type: 'view',
    date: Date.now(),
    application: { id: applicationId },
    service: 'kobato',
    session: { id: randomBytes(12).toString('hex'), type: 'user' },
    view: { id: viewId, name: 'routes/public/home', url: 'http://127.0.0.1/' },
    view_loading_type: 'initial_load',
    view_largest_contentful_paint: 2_000_000,
    view_first_byte: 1_000_000,
    view_loading_time: 3_000_000,
    view_cumulative_layout_shift: 0.25,
    // Real flattened SDK shape: O2 stores this as view_performance_inp_duration
    // in nanoseconds; the pipeline must convert to 40_000 us.
    view_performance_inp_duration: 40_000_000,
    _o2: { format_version: 2, trace_id: traceId },
    unknown_secret_field: fx.search,
    context_free_form: fx.sqlValue,
    ip: '203.0.113.9',
    user_agent_os_major: '99',
  }
  const res = await fetch(
    `${state.endpoint}/rum/v1/${state.organization}/rum?o2-api-key=${encodeURIComponent(rumToken)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    },
  )
  assert(res.status === 202 || res.ok, `direct RUM ingest returned ${res.status}`)
  return { viewId, traceId, applicationId }
}

async function measureServerRequests(origin: string, samples: number): Promise<number[]> {
  const results: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    const res = await fetch(origin, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(15_000) })
    assert(res.ok, `timing request returned ${res.status}`)
    await res.arrayBuffer()
    results.push(performance.now() - started)
  }
  return results
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

function assertAllPositive(values: number[], label: string): void {
  assert(values.length > 0, `${label} has no values`)
  for (const value of values) {
    assert(Number.isFinite(value) && value > 0, `${label} has a non-positive value: ${String(value)}`)
  }
}

async function syntheticPanelRow(
  ctx: O2Context,
  dashboard: string,
  panelId: string,
  applicationId: string,
  runStart: number,
): Promise<Record<string, unknown>> {
  const body = unsafeCast<{
    tabs: Array<{ panels: Array<{ id: string; queries: Array<{ query: string }> }> }>
  }>(JSON.parse(await readFile(observabilityDashboardPath(`${dashboard}.json`), 'utf-8')))
  const panel = body.tabs.flatMap((tab) => tab.panels).find((entry) => entry.id === panelId)
  assert(panel !== undefined, `missing panel ${panelId}`)
  const query = panel.queries[0]?.query
  assert(query !== undefined, `missing query ${panelId}`)
  const filtered = query.replace("WHERE type = 'view'", `WHERE type = 'view' AND application_id = '${applicationId}'`)
  assert(filtered !== query, `panel ${panelId} has no view filter to scope`)
  const result = await search(ctx, { type: 'logs', sql: filtered, startTimeMs: runStart, size: 100 })
  const row = result.hits?.[0]
  assert(row !== undefined, `panel ${panelId} returned no synthetic row`)
  return row
}

async function panelRow(
  ctx: O2Context,
  dashboard: string,
  panelId: string,
  runStart: number,
): Promise<Record<string, unknown>> {
  const body = unsafeCast<{
    tabs: Array<{
      panels: Array<{ id: string; queries: Array<{ query: string; fields: { stream_type: string } }> }>
    }>
  }>(JSON.parse(await readFile(observabilityDashboardPath(`${dashboard}.json`), 'utf-8')))
  const panel = body.tabs.flatMap((tab) => tab.panels).find((entry) => entry.id === panelId)
  assert(panel !== undefined, `missing panel ${panelId}`)
  const query = panel.queries[0]
  assert(query !== undefined, `missing query ${panelId}`)
  const type =
    query.fields.stream_type === 'traces' ? 'traces' : query.fields.stream_type === 'metrics' ? 'metrics' : 'logs'
  const result = await search(ctx, { type, sql: query.query, startTimeMs: runStart, size: 100 })
  const row = result.hits?.[0]
  assert(row !== undefined, `panel ${panelId} returned no row`)
  return row
}

async function restartOpenObserve(state: TraceState): Promise<void> {
  docker(['start', state.containerName])
  try {
    await waitForOpenObserve(state.endpoint, 90_000)
  } catch {
    // A stopped container occasionally needs a full restart under load.
    docker(['restart', state.containerName])
    await waitForOpenObserve(state.endpoint, 180_000)
  }
}

async function readRumRowsSince(ctx: O2Context, sinceMs: number): Promise<RumRow[]> {
  const result = await search(ctx, {
    type: 'logs',
    sql: `SELECT * FROM "_rumdata" WHERE _timestamp >= ${sinceMs * 1000} LIMIT 1000`,
    startTimeMs: sinceMs,
    size: 1000,
  })
  return (result.hits ?? []) as RumRow[]
}

function rumRowSignature(rows: RumRow[]): string {
  let latest = 0
  for (const row of rows) {
    const timestamp = typeof row._timestamp === 'number' ? row._timestamp : 0
    if (timestamp > latest) {
      latest = timestamp
    }
  }
  return `${rows.length}:${latest}`
}

/**
 * Wait until no new `_rumdata` rows (count or latest `_timestamp`) arrive for
 * `quietMs`. A consent revocation may flush one final batch; quiescence proves
 * that flush finished without assuming it never happened.
 */
async function waitForRumQuiescence(
  ctx: O2Context,
  sinceMs: number,
  timeoutMs = 60_000,
  quietMs = 6_000,
): Promise<{ signature: string; quiescedAt: number }> {
  const deadline = Date.now() + timeoutMs
  let signature = ''
  let quietSince = 0
  while (Date.now() < deadline) {
    const rows = await readRumRowsSince(ctx, sinceMs)
    const next = rumRowSignature(rows)
    if (next === signature) {
      if (quietSince === 0) {
        quietSince = Date.now()
      }
      if (Date.now() - quietSince >= quietMs) {
        return { signature: next, quiescedAt: Date.now() }
      }
    } else {
      signature = next
      quietSince = Date.now()
    }
    await sleep(2000)
  }
  throw new Error(`RUM rows did not quiesce within ${timeoutMs / 1000}s (last=${signature})`)
}

async function waitForBrowserRumConsent(
  page: Page,
  expected: 'granted' | 'not-granted',
  timeoutMs = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (expectedConsent) => {
      const state: unknown = Reflect.get(window, Symbol.for('kobato.rum.runtime'))
      return state !== null && typeof state === 'object' && Reflect.get(state, 'consent') === expectedConsent
    },
    expected,
    { timeout: timeoutMs },
  )
}

async function waitForRumStatus(origin: string, expected: boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${origin}/api/rum/status`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        const body = unsafeCast<{ enabled?: unknown }>(await res.json())
        if (body.enabled === expected) {
          return
        }
      }
    } catch {
      // keep polling until the deadline
    }
    await sleep(500)
  }
  throw new Error(`RUM status did not become ${String(expected)} within ${timeoutMs / 1000}s`)
}

async function main(): Promise<void> {
  ensureDocker()
  const runStart = Date.now()
  const tempRoot = await mkdtemp(join(tmpdir(), 'kobato-trace-smoke-'))
  const dataDir = join(tempRoot, 'data')
  await mkdir(dataDir, { recursive: true })
  const configPath = join(tempRoot, 'kobato.config.json')
  const serverLog = join(tempRoot, 'kobato-dev.log')

  const o2Port = await pickFreePort()
  const appPort = await pickFreePort()
  const origin = `http://127.0.0.1:${appPort}`
  const fx = fixtures()
  const suffix = randomBytes(4).toString('hex')
  const state = buildState({
    endpoint: `http://127.0.0.1:${o2Port}`,
    port: o2Port,
    containerName: `kobato-trace-smoke-${suffix}`,
    volumeName: `kobato-trace-smoke-${suffix}-data`,
    adminEmail: fx.adminEmail,
    adminPassword: fx.adminPassword,
    applicationId: `kobato-smoke-${suffix}`,
  })

  let server: DevServer | null = null
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    log('==> starting throwaway OpenObserve')
    startOpenObserve(state, { corsOrigins: origin })
    await waitForOpenObserve(state.endpoint)
    const ctx = o2Context(state)

    await writeDevConfig(configPath, appPort, dataDir)

    log('==> booting DEV server (migrations)')
    server = await bootDevServer(configPath, appPort, serverLog)
    await stopDevServer(server)
    server = null

    log('==> seeding synthetic admin and settings')
    seedAdmin(join(dataDir, 'kobato.db'), fx.adminEmail, fx.adminPassword, origin)

    log('==> booting DEV server (installed)')
    server = await bootDevServer(configPath, appPort, serverLog)
    const staged = await stagePost(origin, fx)
    await stageScheduledPost(staged.session, fx)

    log('==> configuring observability through the admin settings surface')
    const connection = await configureObservability(staged.session, state, origin)
    log(
      `    connected to ${state.endpoint} (${connection.organization}, version ${connection.version ?? 'unknown'}); ${connection.provision.status === 'succeeded' ? connection.provision.dashboards : 0} dashboards`,
    )
    const rumToken = await getRumToken(ctx)
    assert(rumToken !== null && rumToken !== '', 'the server did not install a RUM client token')

    log('==> driving Chromium')
    browser = await chromium.launch({ headless: process.env.KOBATO_TRACE_SMOKE_HEADLESS !== '0' })
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const consoleErrors: string[] = []
    const failedResources: string[] = []
    page.on('console', (message: { type: () => string; text: () => string; location: () => { url?: string } }) => {
      if (message.type() === 'error') {
        const location = message.location().url ?? ''
        consoleErrors.push(`${message.text().slice(0, 300)}${location === '' ? '' : ` @ ${location}`}`)
      }
    })
    page.on('requestfailed', (request: { url: () => string; failure: () => { errorText?: string } | null }) => {
      failedResources.push(`${request.url()} ${request.failure()?.errorText ?? 'failed'}`)
    })

    // Initial hard navigation with every forbidden fixture in the raw URL.
    await page.goto(
      `/?email=${encodeURIComponent(fx.email)}&token=${encodeURIComponent(fx.token)}&raw=${encodeURIComponent(fx.rawUrl)}&q=${encodeURIComponent(fx.sqlValue)}`,
      { waitUntil: 'networkidle' },
    )
    await page.waitForFunction(() => typeof window !== 'undefined')

    // Keep Web Vitals realistic: interact and give the observers a moment.
    await page.mouse.move(100, 100)
    await page.waitForTimeout(1500)

    // SPA navigation carrying the search/SQL fixture in the path and query.
    const searchPath = `/search/${encodeURIComponent(fx.search)}?q=${encodeURIComponent(fx.sqlValue)}`
    await page.evaluate((path: string) => {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, searchPath)
    await page.waitForTimeout(1500)

    // A real same-origin oRPC call from the page. The token comes from the
    // document's React Router handoff (`csrfToken` in the root loader data),
    // so it belongs to this browser session; RUM's fetch instrumentation adds
    // the W3C traceparent.
    const html = await page.content()
    const tokenMatch = /"csrfToken":"([0-9a-f]{64})"/.exec(html) ?? /csrfToken[^0-9a-f]{0,16}([0-9a-f]{64})/.exec(html)
    assert(
      tokenMatch !== null,
      `the document carried no root csrfToken (${new Set(html.match(/[0-9a-f]{64}/g) ?? []).size} 64-hex candidates)`,
    )
    const csrfToken = tokenMatch[1]!
    const rpcStatus = await page.evaluate(async (token: string) => {
      const res = await fetch('/rpc/content/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ json: {} }),
      })
      return res.status
    }, csrfToken)
    assert(rpcStatus === 200, `browser oRPC bootstrap returned HTTP ${rpcStatus}`)

    // A real uncaught browser error; the fixture must never leave the browser.
    await page.evaluate((marker: string) => {
      setTimeout(() => {
        throw new Error(marker)
      }, 0)
    }, fx.error)
    await page.waitForTimeout(1500)

    // A second hard load with the indexed public post, so the RUM document
    // view and the server trace are both present for the run.
    await page.goto(`/posts/${encodeURIComponent(fx.slug)}?raw=${encodeURIComponent(fx.rawUrl)}`, {
      waitUntil: 'networkidle',
    })
    await page.waitForTimeout(2000)

    log('==> admin login, admin SPA navigation, editor save, image upload, failed request')
    await loginAsAdmin(page, fx)
    await page
      .locator('a[href="/admin/posts"]')
      .first()
      .evaluate((el: HTMLElement) => el.click())
    await page.waitForURL(/\/admin\/posts/, { timeout: 20_000 })
    await saveFromEditor(page, staged.post.id, fx)
    const jpeg = await makeLargeJpeg()
    const imageUploadMs = await uploadLargeImage(page, jpeg)
    const failedResponse = await page.goto(`/posts/${encodeURIComponent(fx.search)}-missing`, {
      waitUntil: 'networkidle',
    })
    assert(failedResponse?.status() === 404, `missing post returned ${failedResponse?.status() ?? 'no response'}`)

    // Telemetry-on timing samples. These are the same origin and document as
    // the telemetry-off phase; three browser navigations keep the cost bounded.
    log('==> collecting telemetry-on timing samples')
    await fetch(origin).then((res) => res.text())
    const onWarmup = await context.newPage()
    await onWarmup.goto(origin, { waitUntil: 'load' })
    await onWarmup.close()
    const onServerSamples = await measureServerRequests(origin, 5)
    const onBrowserSamples = await measureBrowserNavigation(context, origin, 3)

    log('==> waiting for traces and RUM data in OpenObserve')
    const traceRows = (await waitForRows(
      ctx,
      'traces',
      `SELECT * FROM "default" WHERE service_name = 'kobato' AND start_time >= ${runStart * 1000} LIMIT 1000`,
      runStart,
      (rows) =>
        rows.some((row) => (row as TraceRow).operation_name === 'http.server') &&
        rows.some((row) => (row as TraceRow).operation_name === 'orpc.content.bootstrap') &&
        rows.some((row) => (row as TraceRow).operation_name === 'db.sqlite.query'),
    )) as TraceRow[]

    let rumRows: RumRow[]
    try {
      rumRows = (await waitForRows(
        ctx,
        'logs',
        `SELECT * FROM "_rumdata" WHERE type IN ('view', 'resource', 'error') LIMIT 1000`,
        runStart,
        (rows) =>
          rows.some((row) => row.type === 'view') &&
          rows.some((row) => row.type === 'resource') &&
          rows.some((row) => row.type === 'error'),
      )) as RumRow[]
    } catch (error) {
      if (consoleErrors.length > 0) {
        warn(`browser console errors: ${consoleErrors.join(' | ').slice(0, 1000)}`)
      }
      throw error
    }

    const privacyProbe = await ingestUnknownFieldRumEvent(state, rumToken, fx)

    const jobRows = (await waitForRows(
      ctx,
      'traces',
      `SELECT * FROM "default" WHERE service_name = 'kobato' AND start_time >= ${runStart * 1000} AND operation_name = 'job.run' AND job_task_key = 'scheduled-publish' LIMIT 50`,
      runStart,
      (rows) => rows.length > 0,
    )) as TraceRow[]
    const imageRows = (await waitForRows(
      ctx,
      'traces',
      `SELECT * FROM "default" WHERE service_name = 'kobato' AND start_time >= ${runStart * 1000} AND operation_name = 'image.worker' LIMIT 50`,
      runStart,
      (rows) => rows.length > 0,
    )) as TraceRow[]

    let metricRows: Array<Record<string, unknown>> = []
    let imageMetricRows: Array<Record<string, unknown>> = []
    let queueMetricRows: Array<Record<string, unknown>> = []
    try {
      imageMetricRows = await waitForRows(
        ctx,
        'metrics',
        `SELECT * FROM "${TRACE_METRIC_STREAMS.imageExecutionDurationCount}" LIMIT 100`,
        runStart,
        (rows) => rows.length > 0,
      )
      queueMetricRows = await waitForRows(
        ctx,
        'metrics',
        `SELECT * FROM "${TRACE_METRIC_STREAMS.imageQueueDurationCount}" LIMIT 100`,
        runStart,
        (rows) => rows.length > 0,
      )
    } catch {
      // Recorded by the page-level metrics check below.
    }
    try {
      metricRows = await waitForRows(
        ctx,
        'metrics',
        `SELECT * FROM "${TRACE_METRIC_STREAMS.httpServerDurationCount}" LIMIT 1000`,
        runStart,
        (rows) => rows.length > 0,
      )
    } catch {
      // The panel-level verification below records the specific failure.
    }
    const metricTables = await listStreams(ctx, 'metrics')

    // Hard probe: the DEV server's log pipeline must have created the
    // independent `kobato_logs` stream (v1.1.2 honours the OTLP `stream-name`
    // header for logs). The projected columns below are the real flattened
    // names observed in OpenObserve, not assumptions.
    const logStreams = await listStreams(ctx, 'logs')
    assert(
      logStreams.some((stream) => stream.name === LOG_STREAM),
      `no ${LOG_STREAM} stream: ${logStreams.map((stream) => stream.name).join(', ')}`,
    )
    const logRows = (await waitForRows(
      ctx,
      'logs',
      `SELECT * FROM "${LOG_STREAM}" WHERE service_name = 'kobato' AND _timestamp >= ${runStart * 1000} LIMIT 1000`,
      runStart,
      (rows) => rows.some((row) => typeof row.trace_id === 'string' && typeof row.span_id === 'string'),
    )) as LogRow[]

    log('')
    log('== checks ==')

    await check('settings-driven observability is verified, provisioned and running (P2/P3 chain)', async () => {
      const status = await readObservabilityStatus(staged.session)
      assert(status.runtime.phase === 'running', `runtime phase is ${status.runtime.phase}`)
      assert(status.runtime.lastError === null, `runtime reported ${status.runtime.lastError}`)
      assert(status.verified, 'the saved connection is not verified')
      assert(status.provisioned && status.provisionedCurrent, 'provisioned assets are missing or stale')
      assert(status.version !== null, 'the connection test did not report an OpenObserve version')
      return `phase=${status.runtime.phase} verified=${status.verified} provisionedCurrent=${status.provisionedCurrent} version=${status.version}`
    })

    await check('CSP never exposes the O2 origin (browser RUM relays same-origin)', async () => {
      const res = await fetch(origin, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(10_000) })
      assert(res.ok, `public page returned ${res.status}`)
      const csp = res.headers.get('content-security-policy') ?? ''
      assert(!csp.includes(state.endpoint), 'connect-src must never carry the OpenObserve origin')
      assert(csp.includes("connect-src 'self'"), 'connect-src is missing the self baseline')
      return "connect-src 'self'"
    })

    await check('same-origin intake relay injects the RUM token and forwards', async () => {
      const viewId = randomBytes(12).toString('hex')
      const payload = {
        type: 'view',
        date: Date.now(),
        application: { id: `relay-probe-${viewId}` },
        service: 'kobato',
        session: { id: randomBytes(12).toString('hex'), type: 'user' },
        view: { id: viewId, name: 'routes/public/home', url: `${origin}/` },
        view_loading_type: 'initial_load',
        _o2: { format_version: 2 },
      }
      // The browser never learns the configured organization — the slim SDK
      // posts `organizationIdentifier ?? 'default'`. Probe with a deliberately
      // foreign segment: the relay must validate only the track shape and
      // rewrite the upstream org (the row lands in the CONFIGURED org's
      // stream, searched below through `ctx`).
      const res = await fetch(
        `${origin}/api/rum/intake/rum/v1/foreign-sdk-org/rum?o2source=browser&o2-api-key=kobato-relay&batch_time=${Date.now()}`,
        {
          method: 'POST',
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        },
      )
      assert(res.status === 202, `the intake relay returned ${res.status}`)
      await waitForRows(
        ctx,
        'logs',
        `SELECT * FROM "_rumdata" WHERE view_id = '${viewId}' LIMIT 10`,
        runStart,
        (rows) => rows.some((row) => row.type === 'view'),
      )
      return `view ${viewId} relayed through the app origin (org segment rewritten)`
    })

    await check('server waterfall: Hono → RR → oRPC → SQLite → SSR', () => {
      const names = new Set(traceRows.map((row) => row.operation_name))
      for (const required of ['http.server', 'rr.document', 'orpc.content.bootstrap', 'db.sqlite.query', 'ssr.shell']) {
        assert(names.has(required), `missing span ${required}`)
      }
      return `${traceRows.length} spans; ${[...names]
        .filter((name) => name !== undefined)
        .slice(0, 12)
        .join(', ')}`
    })

    await check('real admin login, admin SPA navigation, editor save and image upload', () => {
      const names = new Set(traceRows.map((row) => row.operation_name))
      for (const required of ['orpc.admin.images.upload', 'orpc.admin.posts.upsertMeta']) {
        assert(names.has(required), `missing span ${required}`)
      }
      const adminView = rumRows.find(
        (row) => row.type === 'view' && typeof row.view_name === 'string' && row.view_name.startsWith('routes/admin'),
      )
      const editorView = rumRows.find(
        (row) => row.type === 'view' && typeof row.view_name === 'string' && row.view_name.startsWith('routes/editor'),
      )
      assert(adminView !== undefined, 'no admin RUM view reached OpenObserve')
      assert(editorView !== undefined, 'no editor RUM view reached OpenObserve')
      return `admin=${adminView.view_name}; editor=${editorView.view_name}; imageUpload=${imageUploadMs}ms`
    })

    await check('image processing ran inline in DEV and is a measurable slow operation', () => {
      const image = imageRows.find((row) => row.operation_name === 'image.worker')
      assert(image !== undefined, 'no image.worker span')
      const durationUs = image.duration ?? 0
      assert(durationUs >= 5_000, `image.worker lasted only ${durationUs}µs`)
      return `${(durationUs / 1000).toFixed(1)}ms span (upload round-trip ${imageUploadMs}ms)`
    })

    await check('scheduled content fired a real job.run', () => {
      const job = jobRows.find((row) => row.operation_name === 'job.run')
      assert(job !== undefined, 'no job.run span')
      assert(job.job_task_key === 'scheduled-publish', `unexpected job task ${String(job.job_task_key)}`)
      const name = typeof job.job_name === 'string' ? job.job_name : 'unknown'
      const task = typeof job.job_task_key === 'string' ? job.job_task_key : 'unknown'
      return `${name} / ${task} in ${((job.duration ?? 0) / 1000).toFixed(1)}ms`
    })

    await check('failed request produced a traced 404', () => {
      const failed = traceRows.filter((row) => Number(row.http_response_status_code) === 404)
      assert(failed.length > 0, 'no 404 span reached OpenObserve')
      assert(
        failed.some((row) => row.operation_name === 'http.server') &&
          failed.some((row) => row.operation_name === 'rr.document'),
        '404 did not cover the Hono and React Router spans',
      )
      return `${failed.length} 404 span(s)`
    })

    await check('trace waterfall parent/child links', () => {
      const spanIds = new Set(traceRows.map((row) => row.span_id).filter(Boolean))
      const child = traceRows.find(
        (row) =>
          row.reference_parent_span_id !== undefined &&
          row.reference_parent_span_id !== '' &&
          spanIds.has(row.reference_parent_span_id),
      )
      assert(child !== undefined, 'no span references a parent span in the same result set')
      return `${child?.operation_name} → parent ${child?.reference_parent_span_id}`
    })

    await check('RUM resource carries a matching W3C trace id', () => {
      const traceIds = new Set(traceRows.map((row) => row.trace_id).filter(Boolean))
      const resource = rumRows.find(
        (row) => row.type === 'resource' && typeof row._o2_trace_id === 'string' && traceIds.has(row._o2_trace_id),
      )
      assert(resource !== undefined, 'no RUM resource trace id matches a server trace id')
      const serverSpans = traceRows.filter((row) => row.trace_id === resource?._o2_trace_id)
      assert(
        serverSpans.some((row) => row.operation_name === 'http.server'),
        'matching trace has no http.server span',
      )
      return `${resource?._o2_trace_id} (${serverSpans.length} spans)`
    })

    await check('RUM Web Vitals, resources and SPA views', () => {
      const view = rumRows.find((row) => row.type === 'view' && row.view_first_byte !== undefined)
      assert(view !== undefined, 'no view event with first_byte')
      const lcp = rumRows.some((row) => row.type === 'view' && row.view_largest_contentful_paint !== undefined)
      const cls = rumRows.some((row) => row.type === 'view' && row.view_cumulative_layout_shift !== undefined)
      const inp = rumRows.some((row) => row.type === 'view' && typeof row.view_inp_us === 'number')
      const routeChange = rumRows.some((row) => row.type === 'view' && row.view_loading_type === 'route_change')
      const resources = rumRows.filter((row) => row.type === 'resource')
      assert(resources.length > 0, 'no RUM resource events')
      assert(lcp || cls, 'no LCP/CLS field reached OpenObserve')
      assert(inp, 'no nonzero INP sample reached OpenObserve')
      assert(
        !rumRows.some((row) => row.type === 'view' && row.view_inp_us === 0),
        'a missing interaction was stored as a fake 0 INP sample',
      )
      assert(
        rumRows.some((row) => row.type === 'view' && (row.view_inp_us === null || row.view_inp_us === undefined)),
        'no interaction-free view stored a null INP',
      )
      return `${rumRows.length} RUM rows; lcp=${lcp} inp=${inp} cls=${cls} route_change=${routeChange} resources=${resources.length}`
    })

    await check('sanitized browser error', () => {
      const errors = rumRows.filter((row) => row.type === 'error')
      assert(errors.length > 0, 'no RUM error events reached OpenObserve')
      assert(
        !stringifyAll(errors as Array<Record<string, unknown>>).includes(fx.error),
        'the raw error message leaked into OpenObserve',
      )
      return `${errors.length} error event(s): ${errors.map((row) => row.error_type ?? '?').join(',')}`
    })

    await check('metrics arrived', () => {
      assert(
        metricTables.some((stream) => stream.name === TRACE_METRIC_STREAMS.httpServerDurationCount),
        'no http.server metric stream',
      )
      assert(metricRows.length > 0, 'no http.server metric rows')
      const eventLoop = metricTables.some((stream) => stream.name === TRACE_METRIC_STREAMS.eventLoopDelay)
      const imageMetrics = metricTables.some(
        (stream) =>
          stream.name === TRACE_METRIC_STREAMS.imageExecutionDurationCount ||
          stream.name === TRACE_METRIC_STREAMS.imageExecutionDurationSum,
      )
      assert(imageMetrics, 'no image execution metric stream')
      assert(imageMetricRows.length > 0, 'no image execution metric rows')
      const queueMetrics = metricTables.some(
        (stream) =>
          stream.name === TRACE_METRIC_STREAMS.imageQueueDurationCount ||
          stream.name === TRACE_METRIC_STREAMS.imageQueueDurationSum,
      )
      assert(queueMetrics, 'no image queue metric stream')
      assert(queueMetricRows.length > 0, 'no image queue metric rows')
      return `${metricRows.length} http metric rows; event_loop_delay=${eventLoop}; image/queue metrics=${imageMetrics}/${queueMetrics}`
    })

    await check('metric rows carry no trace_id/span_id labels', async () => {
      const rows = await waitForRows(
        ctx,
        'metrics',
        `SELECT * FROM "${TRACE_METRIC_STREAMS.httpServerDurationCount}" LIMIT 100`,
        runStart,
        (result) => result.length > 0,
      )
      const keys = new Set<string>()
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          keys.add(key)
        }
      }
      const leaked = [...keys].filter((key) => key === 'trace_id' || key === 'span_id')
      assert(leaked.length === 0, `metric rows contain forbidden label columns: ${leaked.join(', ')}`)
      return `${rows.length} metric rows; ${keys.size} columns; no trace_id/span_id (no exemplar channel upstream)`
    })

    await check('metric streams carry delta increments, not cumulative snapshots', async () => {
      const countRows = await waitForRows(
        ctx,
        'metrics',
        `SELECT value FROM "${TRACE_METRIC_STREAMS.imageExecutionDurationCount}"`,
        runStart,
        (rows) => rows.length > 0,
      )
      const sumRows = await waitForRows(
        ctx,
        'metrics',
        `SELECT value FROM "${TRACE_METRIC_STREAMS.imageExecutionDurationSum}"`,
        runStart,
        (rows) => rows.length > 0,
      )
      const gauge = await search(ctx, {
        type: 'metrics',
        sql: `SELECT value FROM "${TRACE_METRIC_STREAMS.eventLoopDelay}"`,
        startTimeMs: runStart,
        size: 1000,
      })
      const counts = countRows.map((row) => Number(row.value))
      const sums = sumRows.map((row) => Number(row.value))
      assertAllPositive(counts, 'image execution count')
      assertAllPositive(sums, 'image execution sum')
      // DELTA emits a data point only for an interval that recorded an
      // observation. One image transform therefore yields a handful of points
      // at most, while CUMULATIVE re-emits the growing snapshot on every 10s
      // collection for the rest of the server lifetime.
      assert(counts.length <= 5, `image execution count has ${counts.length} points; looks cumulative`)
      assert(sums.length <= 5, `image execution sum has ${sums.length} points; looks cumulative`)
      const totalExecutions = counts.reduce((total, value) => total + value, 0)
      assert(totalExecutions <= 20, `image execution count total ${totalExecutions}; looks cumulative`)
      // The observable gauge emits one point per collection, so it counts the
      // collection windows without any fragile wall-clock scheduling. Delta
      // image points must be strictly fewer than that; cumulative points would
      // approach one per collection after the first transform.
      const collectionWindows = (gauge.hits ?? []).length
      if (collectionWindows >= 2) {
        assert(
          counts.length < collectionWindows,
          `image count points ${counts.length} not fewer than ${collectionWindows} event-loop collections; looks cumulative`,
        )
      }
      return `${counts.length} count / ${sums.length} sum points; ${collectionWindows} collection windows; counts=[${counts.join(',')}]`
    })

    await check('server logs land in the independent kobato_logs stream', () => {
      const stream = logStreams.find((entry) => entry.name === LOG_STREAM)
      assert(stream !== undefined, 'kobato_logs is missing')
      assert(stream.stream_type === 'logs', `kobato_logs is a ${stream.stream_type} stream, not logs`)
      const requiredColumns = [
        'body',
        'severity',
        'severity_number',
        'log_scope',
        'trace_id',
        'span_id',
        'service_name',
        'service_version',
        'deployment_environment',
        'instrumentation_library_name',
      ]
      for (const column of requiredColumns) {
        assert(
          logRows.some((row) => column in row),
          `kobato_logs has no projected column ${column}`,
        )
      }
      const severities = [...new Set(logRows.map((row) => row.severity).filter((value) => value !== undefined))].sort()
      return `${logRows.length} rows in kobato_logs; severities=${severities.join(',')}; ${requiredColumns.length} columns verified`
    })

    await check('HTTP response log correlates with its http.server span by trace and span id', () => {
      const serverSpans = new Map(
        traceRows
          .filter((row) => row.operation_name === 'http.server')
          .map((row) => [`${String(row.trace_id)}:${String(row.span_id)}`, row]),
      )
      const phrases = new Set(['HTTP request completed', 'HTTP request rejected', 'HTTP request failed'])
      const correlated = logRows.find(
        (row) =>
          row.log_scope === 'http' &&
          typeof row.body === 'string' &&
          phrases.has(row.body) &&
          serverSpans.has(`${String(row.trace_id)}:${String(row.span_id)}`),
      )
      assert(correlated !== undefined, 'no HTTP log row shares trace_id AND span_id with an http.server span')
      const span = serverSpans.get(`${String(correlated?.trace_id)}:${String(correlated?.span_id)}`)!
      assert(correlated?.service_name === span.service_name, 'log service_name differs from the trace resource')
      // O2 flattens the trace resource's `service.version`/`deployment.environment`
      // as `service_service_version`/`service_deployment_environment`, while the
      // log stream stores `service_version`/`deployment_environment`.
      const traceVersion = span.service_service_version ?? span.service_version
      const traceEnvironment = span.service_deployment_environment ?? span.deployment_environment
      assert(
        typeof traceVersion === 'string' && correlated?.service_version === traceVersion,
        `log service_version ${String(correlated?.service_version)} differs from the trace resource ${String(traceVersion)}`,
      )
      assert(
        correlated?.deployment_environment === traceEnvironment,
        `log deployment.environment ${String(correlated?.deployment_environment)} differs from the trace resource ${String(traceEnvironment)}`,
      )
      assert(correlated?.deployment_environment === 'development', 'log deployment.environment is not development')
      return `${String(correlated?.trace_id)}/${String(correlated?.span_id)} ${String(correlated?.body)} (${String(correlated?.http_request_method)} ${String(correlated?.http_response_status_code)})`
    })

    await check('server log rows expose only the closed projected fields', () => {
      const forbiddenKeys = [
        /^req$/,
        /^res$/,
        /^req_id$/,
        /^request_id$/,
        /_headers$/,
        /^url$/,
        /^query$/,
        /^pid$/,
        /^hostname$/,
        /^context$/,
        /^error_message$/,
        /^error_stack$/,
        /^error_cause$/,
        /^msg$/,
        /^response_time$/,
        /^http_route$/,
      ]
      const keys = new Set<string>()
      for (const row of logRows) {
        for (const key of Object.keys(row)) {
          keys.add(key)
        }
      }
      const leakedKeys = [...keys].filter((key) => forbiddenKeys.some((pattern) => pattern.test(key)))
      assert(leakedKeys.length === 0, `forbidden log columns: ${leakedKeys.join(', ')}`)

      const phrases = new Set(['HTTP request completed', 'HTTP request rejected', 'HTTP request failed'])
      for (const row of logRows) {
        if (row.log_scope === 'http') {
          assert(
            typeof row.body === 'string' && phrases.has(row.body),
            `HTTP log body is not one of the fixed phrases: ${String(row.body)}`,
          )
        }
      }

      const text = stringifyAll(logRows as Array<Record<string, unknown>>)
      for (const { field, value } of fixtureNeedles(fx)) {
        assert(!text.includes(value), `fixture leaked into server logs: ${field}`)
      }
      return `${logRows.length} rows / ${keys.size} columns; no request/response/URL/query/pid/hostname/context/error columns or fixture values`
    })

    await check('retention is 1 day on every relevant stream (dev tooling policy)', async () => {
      // Retention is the one OpenObserve policy the dev tooling owns in dev; the
      // server applies it only when the admin opts in (`retentionDays`, default 0).
      const first = await applyRetention(ctx)
      assert(first.streams.length > 0, 'no relevant streams found')
      assert(
        first.streams.some((stream) => stream.name === LOG_STREAM),
        `${LOG_STREAM} is missing from the retention set`,
      )
      const converged = await applyRetention(ctx)
      assert(converged.applied === 0, `retention did not converge: ${converged.applied} stream(s) still wrong`)
      const wrong = converged.streams.filter((stream) => stream.retention !== RETENTION_DAYS)
      assert(wrong.length === 0, `retention still not 1 day: ${wrong.map((stream) => stream.name).join(', ')}`)
      return `${converged.streams.length} streams at 1 day (first pass fixed ${first.applied})`
    })

    await check('unknown RUM fields are deleted by default (fail-closed)', async () => {
      const rows = await waitForRows(
        ctx,
        'logs',
        `SELECT * FROM "_rumdata" WHERE view_id = '${privacyProbe.viewId}' LIMIT 10`,
        runStart,
        (result) => result.length > 0,
      )
      assert(rows.length === 1, `expected one probe row, found ${rows.length}`)
      const row = rows[0]!
      assert(!('unknown_secret_field' in row), 'unknown_secret_field survived')
      assert(!('context_free_form' in row), 'context_free_form survived')
      assert(!('ip' in row), 'ip survived')
      assert(!('user_agent_os_major' in row), 'user_agent_os_major survived')
      assert(row.view_largest_contentful_paint === 2_000_000, 'safe Web Vital was dropped')
      assert(row.view_inp_us === 40_000, `INP was ${String(row.view_inp_us)}, expected 40000us`)
      assert(row._o2_trace_id === privacyProbe.traceId, 'trace id was dropped')
      const text = JSON.stringify(row)
      assert(!text.includes(fx.search), 'unknown-field fixture leaked')
      assert(!text.includes(fx.sqlValue), 'free-form fixture leaked')
      return `unknown/free-form/ip/user-agent deleted; vitals and _o2_trace_id kept; INP=${String(row.view_inp_us)}us`
    })

    await check('dashboard duration units convert synthetic ns values to µs', async () => {
      const vitals = await syntheticPanelRow(ctx, 'overview', 'ov-vitals', privacyProbe.applicationId, runStart)
      assert(Math.abs(Number(vitals.lcp_us) - 2000) < 0.01, `ov-vitals LCP ${String(vitals.lcp_us)} != 2000us`)
      assert(Math.abs(Number(vitals.inp_us) - 40_000) < 0.01, `ov-vitals INP ${String(vitals.inp_us)} != 40000us`)
      assert(Math.abs(Number(vitals.cls) - 0.25) < 0.001, `ov-vitals CLS ${String(vitals.cls)} != 0.25`)
      const ttfb = await syntheticPanelRow(ctx, 'overview', 'ov-ttfb', privacyProbe.applicationId, runStart)
      assert(Math.abs(Number(ttfb.ttfb_us) - 1000) < 0.01, `ov-ttfb ${String(ttfb.ttfb_us)} != 1000us`)
      const browserVitals = await syntheticPanelRow(ctx, 'browser', 'br-vitals', privacyProbe.applicationId, runStart)
      assert(
        Math.abs(Number(browserVitals.lcp_us) - 2000) < 0.01 && Math.abs(Number(browserVitals.ttfb_us) - 1000) < 0.01,
        'br-vitals units are not µs',
      )
      const views = await syntheticPanelRow(ctx, 'browser', 'br-views', privacyProbe.applicationId, runStart)
      assert(
        Math.abs(Number(views.avg_loading_us) - 3000) < 0.01,
        `br-views loading ${String(views.avg_loading_us)} != 3000us`,
      )
      return 'LCP 2000us, TTFB 1000us, INP 40000us, loading 3000us'
    })

    await check('RUM privacy pipeline is installed and enabled', async () => {
      const functions = await o2Json<{ list?: Array<{ name?: string }> }>(ctx, '/functions')
      assert(
        (functions.list ?? []).some((entry) => entry.name === RUM_PRIVACY_FUNCTION_NAME),
        'privacy function missing',
      )
      const pipelines = await o2Json<{ list?: Array<{ name?: string; enabled?: boolean }> }>(ctx, '/pipelines')
      const pipeline = (pipelines.list ?? []).find((entry) => entry.name === RUM_PRIVACY_PIPELINE_NAME)
      assert(pipeline !== undefined, 'privacy pipeline missing')
      assert(pipeline?.enabled !== false, 'privacy pipeline is disabled')
      const forbidden = await scanForbiddenFields(ctx, runStart)
      assert(forbidden.length === 0, `forbidden RUM fields stored: ${forbidden.join(', ')}`)
      return 'no ip/geo detail/UA version/device/usr/account/context/request/response fields (coarse geo + UA family allowlisted)'
    })

    await check('dashboard imports resolve', async () => {
      const dashboards = await listDashboards(ctx)
      for (const title of ['Kobato — Overview', 'Kobato — Server', 'Kobato — Browser', 'Kobato — Correlation']) {
        assert(
          dashboards.some((dashboard) => dashboard.title === title),
          `missing dashboard ${title}`,
        )
      }
      return `${dashboards.length} dashboards`
    })

    await check('dashboard panel SQL runs against this smoke data', async () => {
      const files = ['overview', 'server', 'browser', 'correlation']
      const required = new Set([
        'ov-requests',
        'ov-latency',
        'ov-vitals',
        'ov-ttfb',
        'sv-ssr',
        'sv-orpc',
        'sv-db',
        'sv-cache',
        'sv-outbound',
        'sv-image-queue',
        'sv-image-exec',
        'br-views',
        'br-vitals',
        'br-errors',
        'co-spans',
        'co-rum-trace',
        'co-logs',
        'co-slow-requests',
        'sv-log-severity',
        'sv-log-scope',
      ])
      // No 5xx and possibly no outbound traffic in a synthetic run; these
      // panels must still execute, but an empty result is explicitly allowed.
      const allowedEmpty = new Set(['ov-errors', 'sv-outbound'])
      const failures: string[] = []
      let ran = 0
      let withRows = 0
      const zeroRows: string[] = []
      for (const file of files) {
        const body = unsafeCast<{
          tabs: Array<{
            panels: Array<{ id: string; queries: Array<{ query: string; fields: { stream_type: string } }> }>
          }>
        }>(JSON.parse(await readFile(observabilityDashboardPath(`${file}.json`), 'utf-8')))
        for (const panel of body.tabs.flatMap((tab) => tab.panels)) {
          const query = panel.queries[0]
          if (query === undefined) {
            continue
          }
          const type =
            query.fields.stream_type === 'traces'
              ? 'traces'
              : query.fields.stream_type === 'metrics'
                ? 'metrics'
                : 'logs'
          try {
            let result = await search(ctx, {
              type,
              sql: query.query,
              startTimeMs: runStart,
              size: 100,
            })
            if ((result.hits ?? []).length === 0 && required.has(panel.id) && !allowedEmpty.has(panel.id)) {
              // One short retry covers the WAL/metric flush lag between a
              // successful broad read and a panel's narrower query.
              await sleep(1500)
              result = await search(ctx, { type, sql: query.query, startTimeMs: runStart, size: 100 })
            }
            ran += 1
            if ((result.hits ?? []).length > 0) {
              withRows += 1
            } else {
              zeroRows.push(panel.id)
              if (required.has(panel.id) && !allowedEmpty.has(panel.id)) {
                failures.push(`${panel.id}: zero rows`)
              }
            }
          } catch (error) {
            failures.push(`${panel.id}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      assert(failures.length === 0, failures.join('; '))
      return `${ran} panel queries ran, ${withRows} returned rows${zeroRows.length === 0 ? '' : ` (zero: ${zeroRows.join(', ')})`}`
    })

    await check('image histogram _sum panels total milliseconds, not averages', async () => {
      const queue = await panelRow(ctx, 'server', 'sv-image-queue', runStart)
      const execution = await panelRow(ctx, 'server', 'sv-image-exec', runStart)
      assert('total_queue_ms' in queue, 'queue panel did not alias sum(value) AS total_queue_ms')
      assert('total_execution_ms' in execution, 'execution panel did not alias sum(value) AS total_execution_ms')
      const queueTotal = Number(queue.total_queue_ms)
      const executionTotal = Number(execution.total_execution_ms)
      assert(Number.isFinite(queueTotal) && queueTotal >= 0, `queue total is ${String(queue.total_queue_ms)}`)
      assert(
        Number.isFinite(executionTotal) && executionTotal > 0,
        `execution total is ${String(execution.total_execution_ms)}, expected > 0ms`,
      )
      return `queue total ${queueTotal}ms (DEV inline 0), execution total ${executionTotal}ms`
    })

    await check('forbidden fixtures absent from traces, metrics and RUM', async () => {
      const haystacks: string[] = [stringifyAll(traceRows)]
      haystacks.push(stringifyAll(rumRows))
      for (const stream of metricTables) {
        try {
          const result = await search(ctx, {
            type: 'metrics',
            sql: `SELECT * FROM "${stream.name}" LIMIT 1000`,
            startTimeMs: runStart,
            size: 1000,
          })
          haystacks.push(stringifyAll(result.hits ?? []))
        } catch {
          // A histogram base stream has no rows in OpenObserve; its _count/
          // _sum/_bucket siblings carry the data and are scanned separately.
        }
      }
      for (const { field, value } of fixtureNeedles(fx)) {
        for (const haystack of haystacks) {
          assert(!haystack.includes(value), `fixture leaked: ${field}`)
        }
      }
      return 'all fixture fields absent (admin credentials, slug, title, search, SQL, raw URL, error)'
    })

    await check('browser console produced no unexpected error', () => {
      // The deliberate thrown error and the intentional 404 are expected.
      const unexpected = consoleErrors.filter(
        (line) =>
          !line.includes('smoke-secret-error') &&
          !line.includes('status of 404') &&
          // The synthetic seeded asset settings point at a non-existent
          // 127.0.0.1 image host; that fallback is unrelated to telemetry.
          !/127\.0\.0\.1(?::\d+)?\/images\//.test(line) &&
          !/127\.0\.0\.1(?::\d+)?\/storage\//.test(line),
      )
      if (unexpected.length > 0) {
        warn(`failed resources: ${failedResources.join(' | ').slice(0, 1000)}`)
      }
      assert(unexpected.length === 0, unexpected.join(' | ').slice(0, 500))
      return `${consoleErrors.length} expected console error(s)`
    })

    log('')
    log('== failure isolation ==')

    const outageStart = Date.now()
    await check('site keeps serving while OpenObserve is down', async () => {
      docker(['stop', state.containerName])
      await sleep(1000)
      const durations: number[] = []
      for (let index = 0; index < 30; index += 1) {
        const started = Date.now()
        const res = await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) })
        durations.push(Date.now() - started)
        assert(res.status < 500, `request ${index} returned ${res.status}`)
      }
      const max = Math.max(...durations)
      assert(max < 3000, `a request took ${max}ms while OpenObserve was down`)
      return `30 requests, max ${max}ms`
    })

    await check('telemetry queue stays bounded during the outage', async () => {
      const pid = server?.child.pid
      assert(pid !== undefined, 'DEV server pid unavailable')
      const before = await processTreeRssKb(pid)
      for (let index = 0; index < 200; index += 1) {
        await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) })
      }
      const after = await processTreeRssKb(pid)
      const growthMb = Math.max(0, after - before) / 1024
      assert(growthMb < 150, `RSS grew by ${growthMb.toFixed(1)} MB during 200 requests`)
      return `process tree RSS ${((after - before) / 1024).toFixed(1)} MB delta over 200 requests`
    })

    await check('DEV server shuts down cleanly while OpenObserve is down', async () => {
      assert(server !== null, 'DEV server is not running')
      const started = Date.now()
      await stopDevServer(server)
      server = null
      return `stopped in ${Date.now() - started}ms`
    })

    const o2RestartAt = Date.now()
    await check('OpenObserve restart accepts only new traces and logs', async () => {
      await restartOpenObserve(state)
      server = await bootDevServer(configPath, appPort, serverLog)
      await fetch(`${origin}/`, { signal: AbortSignal.timeout(10_000) })
      const after = (await waitForRows(
        ctx,
        'traces',
        `SELECT * FROM "default" WHERE service_name = 'kobato' AND start_time >= ${o2RestartAt * 1000} LIMIT 200`,
        o2RestartAt,
        (rows) => rows.length > 0,
      )) as TraceRow[]
      const outageWindow = (await search(ctx, {
        type: 'traces',
        sql: `SELECT * FROM "default" WHERE service_name = 'kobato' AND start_time >= ${outageStart * 1000} AND start_time < ${o2RestartAt * 1000} LIMIT 1000`,
        startTimeMs: outageStart,
        endTimeMs: o2RestartAt,
        size: 1000,
      })) as { hits?: TraceRow[] }
      assert(after.length > 0, 'no new trace arrived after the restart')
      assert(
        (outageWindow.hits ?? []).length === 0,
        `${outageWindow.hits?.length ?? 0} outage-window spans were replayed after restart`,
      )

      const logsAfter = (await waitForRows(
        ctx,
        'logs',
        `SELECT * FROM "${LOG_STREAM}" WHERE service_name = 'kobato' AND _timestamp >= ${o2RestartAt * 1000} LIMIT 200`,
        o2RestartAt,
        (rows) => rows.length > 0,
      )) as LogRow[]
      const outageLogs = (await search(ctx, {
        type: 'logs',
        sql: `SELECT * FROM "${LOG_STREAM}" WHERE service_name = 'kobato' AND _timestamp >= ${outageStart * 1000} AND _timestamp < ${o2RestartAt * 1000} LIMIT 1000`,
        startTimeMs: outageStart,
        endTimeMs: o2RestartAt,
        size: 1000,
      })) as { hits?: LogRow[] }
      assert(logsAfter.length > 0, 'no new server log arrived after the restart')
      assert(
        (outageLogs.hits ?? []).length === 0,
        `${outageLogs.hits?.length ?? 0} outage-window log rows were replayed after restart`,
      )
      return `${after.length} new spans, ${logsAfter.length} new log rows; ${outageWindow.hits?.length ?? 0} spans / ${outageLogs.hits?.length ?? 0} logs replayed`
    })

    await check('frontend RUM is withheld when OpenObserve is unavailable at startup', async () => {
      docker(['stop', state.containerName])
      assert(server !== null, 'DEV server is not running')
      await stopDevServer(server)
      server = await bootDevServer(configPath, appPort, serverLog)
      const res = await fetch(origin, { signal: AbortSignal.timeout(10_000) })
      assert(res.ok, `public page returned ${res.status} while O2 was offline`)
      const html = await res.text()
      assert(!html.includes('clientToken'), 'frontend RUM bootstrap leaked while O2 was offline')
      assert(!html.includes('o2-api-key'), 'RUM intake marker leaked while O2 was offline')
      const csp = res.headers.get('content-security-policy') ?? ''
      assert(!csp.includes(state.endpoint), 'connect-src kept the O2 origin without a verified gate')
      const relay = await fetch(`${origin}/api/rum/intake/rum/v1/${state.organization}/rum?o2-api-key=kobato-relay`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
      })
      assert(relay.status === 404, `the intake relay answered ${relay.status} while O2 was offline`)
      return 'server served normally; no frontend bootstrap/CSP RUM origin; relay closed'
    })

    await check('running pipeline tamper stops an open browser and restore resumes it', async () => {
      assert(server !== null, 'DEV server is not running')
      assert(browser !== null, 'browser is not running')
      await restartOpenObserve(state)
      await waitForRumStatus(origin, true, 30_000)
      const openPage = browser.contexts()[0]?.pages()[0] ?? null
      assert(openPage !== null, 'open browser page unavailable')
      // Park the open tab on an editor with unsaved input. Recovery must resume
      // in this same document: no goto/reload/navigation is allowed below.
      await openPage.goto(`${origin}/editor/post/${staged.post.id}`, { waitUntil: 'networkidle' })
      const unsavedInput = openPage.locator('input[aria-label*="标题"], input[aria-label*="title"]').first()
      await unsavedInput.waitFor({ state: 'visible', timeout: 20_000 })
      const unsavedMarker = `unsaved-rum-${suffix}-${Date.now().toString(36)}`
      await unsavedInput.fill(unsavedMarker)
      const unsavedBefore = await unsavedInput.inputValue()
      const documentToken = await openPage.evaluate(() => {
        const token = crypto.randomUUID()
        Reflect.set(window, '__kobatoSmokeDocumentToken', token)
        return token
      })
      await openPage.waitForTimeout(2000)

      const verificationCtx = o2Context(state)
      await upsertFunction(verificationCtx, {
        name: RUM_PRIVACY_FUNCTION_NAME,
        // Preserve every event field (so the browser/flush behavior is real)
        // while changing the stored function body, which fails the server's
        // hash verification and closes the gate.
        function: '# tampered allowlist — preserve fields, invalid stored hash\n. = .',
        transType: 0,
      })
      await waitForRumStatus(origin, false, 30_000)
      const stoppedAt = Date.now()
      // Wait for the open page to observe the revoked consent. A final batch
      // flush is allowed; quiescence proves no further rows arrive.
      await waitForBrowserRumConsent(openPage, 'not-granted', 30_000)
      const quiescence = await waitForRumQuiescence(ctx, stoppedAt, 60_000)
      await sleep(5000)
      const afterQuiesce = await readRumRowsSince(ctx, stoppedAt)
      assert(
        rumRowSignature(afterQuiesce) === quiescence.signature,
        `RUM rows arrived after quiescence (${quiescence.signature} → ${rumRowSignature(afterQuiesce)})`,
      )

      // Restore through the PRODUCT path: the admin provision procedure
      // re-installs the privacy pipeline idempotently and re-applies the runtime.
      const restore = await callE2eRpc<{ provisionedFingerprint: string }>(
        staged.session.client,
        '/admin/observability/provision',
        {},
        staged.session.csrfToken,
      )
      assert(restore.status === 200, `provision restore failed (${restore.status})`)
      assert(restore.json.provisionedFingerprint !== '', 'provision restore returned no fingerprint')
      await waitForRumStatus(origin, true, 30_000)
      await waitForBrowserRumConsent(openPage, 'granted', 30_000)
      const rumState = await openPage.evaluate(() => {
        const state = Reflect.get(window, Symbol.for('kobato.rum.runtime'))
        if (state === undefined || state === null) {
          return null
        }
        return {
          status: Reflect.get(state, 'status'),
          consent: Reflect.get(state, 'consent'),
          polling: Reflect.get(state, 'pollTimer') !== null,
          revoked: Reflect.get(state, 'revokedByGate'),
        }
      })
      const sameDocument = await openPage.evaluate(
        (token) => Reflect.get(window, '__kobatoSmokeDocumentToken') === token,
        documentToken,
      )
      assert(sameDocument, 'RUM recovery reloaded or navigated the open editor document')
      assert(
        openPage.url().includes(`/editor/post/${staged.post.id}`),
        `RUM recovery changed the open editor URL to ${openPage.url()}`,
      )
      const unsavedAfter = await unsavedInput.inputValue()
      assert(
        unsavedAfter === unsavedBefore,
        `RUM recovery changed unsaved editor input (${JSON.stringify(unsavedBefore)} → ${JSON.stringify(unsavedAfter)})`,
      )

      const afterRestore = await waitForRows(
        ctx,
        'logs',
        `SELECT * FROM "_rumdata" WHERE _timestamp >= ${quiescence.quiescedAt * 1000} AND type = 'view' LIMIT 1000`,
        quiescence.quiescedAt,
        (rows) =>
          rows.some(
            (row) =>
              row.type === 'view' && typeof row.view_name === 'string' && row.view_name.startsWith('routes/editor'),
          ),
        60_000,
      )
      const resumedEditorView = afterRestore.find(
        (row) => row.type === 'view' && typeof row.view_name === 'string' && row.view_name.startsWith('routes/editor'),
      )
      assert(
        resumedEditorView !== undefined,
        `open browser did not resume RUM after restore without navigation (state=${JSON.stringify(rumState)})`,
      )
      return `quiesced (${quiescence.signature}); same-document startView resumed editor RUM without navigation (${JSON.stringify(rumState)})`
    })

    await check('telemetry on/off overhead comparison recorded', async () => {
      // Flip the PRODUCT switch instead of rewriting a config file: the runtime
      // stops exporting without a server restart, then restarts from the SAME
      // verified settings (the connection fingerprint excludes `enabled`).
      await saveObservabilitySettings(staged.session, { enabled: false })
      await waitForRuntimePhase(staged.session, 'disabled')
      await waitForRumStatus(origin, false, 30_000)
      await fetch(origin).then((res) => res.text())
      const offServerSamples = await measureServerRequests(origin, 5)
      assert(browser !== null, 'browser is not running')
      const offContext = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 900 } })
      const offWarmup = await offContext.newPage()
      await offWarmup.goto(origin, { waitUntil: 'load' })
      await offWarmup.close()
      const offBrowserSamples = await measureBrowserNavigation(offContext, origin, 3)
      await offContext.close()

      await saveObservabilitySettings(staged.session, { enabled: true })
      await waitForRuntimePhase(staged.session, 'running')
      await waitForRumStatus(origin, true, 60_000)

      const round = (values: number[]) => values.map((value) => Math.round(value * 10) / 10)
      const onServerMedian = median(onServerSamples)
      const offServerMedian = median(offServerSamples)
      const onNavMedian = median(onBrowserSamples.map((sample) => sample.navigationMs))
      const offNavMedian = median(offBrowserSamples.map((sample) => sample.navigationMs))
      const onLcpMedian = median(onBrowserSamples.map((sample) => sample.lcpMs))
      const offLcpMedian = median(offBrowserSamples.map((sample) => sample.lcpMs))
      log(`    server on=${JSON.stringify(round(onServerSamples))} off=${JSON.stringify(round(offServerSamples))}`)
      log(
        `    browser nav on=${JSON.stringify(round(onBrowserSamples.map((s) => s.navigationMs)))} off=${JSON.stringify(round(offBrowserSamples.map((s) => s.navigationMs)))}`,
      )
      log(
        `    browser lcp on=${JSON.stringify(round(onBrowserSamples.map((s) => s.lcpMs)))} off=${JSON.stringify(round(offBrowserSamples.map((s) => s.lcpMs)))}`,
      )
      assert(onServerSamples.length === 5 && offServerSamples.length === 5, 'server sample count mismatch')
      assert(onBrowserSamples.length === 3 && offBrowserSamples.length === 3, 'browser sample count mismatch')
      return `server ${onServerMedian.toFixed(1)}→${offServerMedian.toFixed(1)}ms; nav ${onNavMedian.toFixed(1)}→${offNavMedian.toFixed(1)}ms; lcp ${onLcpMedian.toFixed(1)}→${offLcpMedian.toFixed(1)}ms (5 server / 3 browser samples each)`
    })

    const failed = checks.filter((entry) => !entry.ok)
    log('')
    log(`${checks.length - failed.length}/${checks.length} checks passed`)
    if (failed.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await browser?.close().catch(() => undefined)
    if (server !== null) {
      await stopDevServer(server).catch(() => undefined)
    }
    if (process.env.KOBATO_TRACE_SMOKE_KEEP !== '1') {
      try {
        stopOpenObserve(state.containerName, true, state.volumeName)
      } catch {
        // A partial docker run must not mask the smoke result.
      }
    }
    if (process.env.KOBATO_TRACE_SMOKE_KEEP === '1') {
      warn(
        `kept diagnostics in ${tempRoot}; OpenObserve container ${state.containerName} and volume ${state.volumeName} were kept`,
      )
    } else {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
}

try {
  await main()
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
