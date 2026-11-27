import type { ExitState } from '@kobato/pack/process'
import type { ChildProcess } from 'node:child_process'

import { isRecord } from '@kobato/base/utils/type-guards'
import { waitForHttp } from '@kobato/pack/instance/sea-instance'
import { seedInstalledInstance } from '@kobato/pack/instance/seed'
import { makeTempDirs, smokeDatabases } from '@kobato/pack/instance/temp'
import { fetchManual, pickFreePort, raceChildExit, scrubbedParentEnv, watchChildExit } from '@kobato/pack/process'
import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults'
import bcrypt from 'bcryptjs'
import { spawn, spawnSync, execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

interface RunningServer {
  child: ChildProcess
  exitState: ExitState
  port: number
  logPath: string
}

const SHUTDOWN_TIMEOUT_MS = 15_000
const VERSION_TIMEOUT_MS = 30_000
const SEA_MODE = process.argv.includes('--sea')
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const kobatoBinary = join(repoRoot, 'dist-sea/kobato')
const sayakaBinary = join(repoRoot, 'dist-sea/sayaka')
const kobatoNodeEntry = join(repoRoot, 'apps/kobato/build/server/index.js')
const sayakaNodeEntry = join(repoRoot, 'apps/sayaka/build/server/index.js')
const kobatoCommand = SEA_MODE ? kobatoBinary : process.execPath
const sayakaCommand = SEA_MODE ? sayakaBinary : process.execPath
const kobatoBaseArgs = SEA_MODE ? [] : [kobatoNodeEntry]
const sayakaBaseArgs = SEA_MODE ? [] : [sayakaNodeEntry]

interface AppIdentity {
  name: string
  version: string
}

function readAppIdentity(app: 'kobato' | 'sayaka'): AppIdentity {
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, 'apps', app, 'package.json'), 'utf-8'))
  if (!isRecord(manifest) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`${app} package.json carries no name/version`)
  }
  return { name: manifest.name, version: manifest.version }
}

async function checkBinaryVersion(binary: string, identity: AppIdentity): Promise<string> {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf-8', timeout: VERSION_TIMEOUT_MS })
  if (result.error !== undefined) {
    throw new Error(`--version failed to run: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `--version exited ${result.status ?? 'by signal'} (expected 0 without booting a listener); stderr: ${
        result.stderr ?? ''
      }`,
    )
  }
  const expected = `${identity.name} ${identity.version}\n`
  if (result.stdout !== expected) {
    throw new Error(`stdout ${JSON.stringify(result.stdout)} != expected ${JSON.stringify(expected)}`)
  }
  return `exit 0, ${JSON.stringify(result.stdout)}`
}

const results: CheckResult[] = []

interface SmokeState {
  kobato: RunningServer | null
  sayaka: RunningServer | null
  tempRoot: string | null
  chrome: ChildProcess | null
}

const smokeState: SmokeState = { kobato: null, sayaka: null, tempRoot: null, chrome: null }

function stopChildrenSync(): void {
  for (const server of [smokeState.kobato, smokeState.sayaka]) {
    if (server !== null && !server.exitState.exited) {
      try {
        server.child.kill('SIGTERM')
      } catch {}
    }
  }
}

async function shutdownOnSignal(reason: string): Promise<void> {
  const failed = results.some((result) => !result.ok)
  if (smokeState.chrome?.pid !== undefined) {
    try {
      process.kill(-smokeState.chrome.pid, 'SIGKILL')
    } catch {}
  }
  for (const server of [smokeState.kobato, smokeState.sayaka]) {
    if (server !== null && !server.exitState.exited) {
      server.child.kill('SIGTERM')
      await raceChildExit(server.child, server.exitState, SHUTDOWN_TIMEOUT_MS).catch(() => undefined)
    }
  }
  if (smokeState.tempRoot !== null) {
    if (failed) {
      console.log(`    ${reason}: stopped all children, kept ${smokeState.tempRoot} (a check failed)`)
    } else {
      try {
        execSync(`pkill -9 -f '${smokeState.tempRoot}'`, { stdio: 'ignore' })
      } catch {}
      for (let attempt = 0; attempt < 5 && existsSync(smokeState.tempRoot); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        await rm(smokeState.tempRoot, { recursive: true, force: true }).catch(() => undefined)
      }
      if (existsSync(smokeState.tempRoot)) {
        console.log(`    ${reason}: stopped all children, could not fully remove ${smokeState.tempRoot}`)
      } else {
        console.log(`    ${reason}: stopped all children, removed ${smokeState.tempRoot}`)
      }
    }
  }
  process.exit(1)
}

process.on('SIGTERM', () => {
  void shutdownOnSignal('SIGTERM')
})
process.on('SIGINT', () => {
  void shutdownOnSignal('SIGINT')
})
process.on('exit', () => {
  stopChildrenSync()
  if (smokeState.tempRoot !== null && !results.some((result) => !result.ok)) {
    try {
      rmSync(smokeState.tempRoot, { recursive: true, force: true })
    } catch {}
  }
})

const HEADLESS_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SMOKE_COVER_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const SMOKE_FONT_HASH = 'c'.repeat(64)
const SMOKE_FONT_BYTES = 'woff2-split-smoke-bytes-0123456789'
const SMOKE_STORAGE_BYTES = 'The quick brown fox jumps over the lazy dog — split smoke storage payload 0123456789.'
const SMOKE_SVG_BODY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${'<rect width="8" height="8" fill="#0366d6"/><rect width="7" height="7" x="0.5" y="0.5" fill="#f9826c"/>'.repeat(40)}</svg>`

const INVALID_WEBMENTION_BODY =
  '{"error":{"message":"Invalid webmention request: source and target must be valid http(s) URLs"}}'
const OVERSIZED_WEBMENTION_BODY = '{"error":{"message":"Payload too large"}}'
const DISABLED_WEBMENTION_BODY = '{"error":{"message":"This endpoint no longer accepts webmentions"}}'
const RUM_DISABLED_BODY = '{"error":{"message":"RUM intake is disabled"}}'
const RUM_COMPRESSED_BODY = '{"error":{"message":"Compressed RUM batches are not accepted"}}'

async function dumpDom(origin: string, path: string, profileRoot: string): Promise<string> {
  const profile = join(profileRoot, `chrome-${randomBytes(4).toString('hex')}`)
  await mkdir(profile, { recursive: true })
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(
        HEADLESS_CHROME,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${profile}`,
          '--virtual-time-budget=15000',
          '--dump-dom',
          `${origin}${path}`,
        ],
        { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
      )
      smokeState.chrome = child
      let out = ''
      const timer = setTimeout(() => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {}
        }
        reject(new Error(`headless Chrome timed out after 60s for ${origin}${path}`))
      }, 60_000)
      child.stdout?.on('data', (chunk) => {
        out += chunk
        if (out.length > 32 * 1024 * 1024) {
          clearTimeout(timer)
          if (child.pid !== undefined) {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {}
          }
          reject(new Error(`headless Chrome output exceeded 32 MiB for ${origin}${path}`))
        }
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', () => {
        clearTimeout(timer)
        resolve(out)
      })
    })
  } finally {
    smokeState.chrome = null
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}

function assertHydratedSigninForm(dom: string, label: string): string {
  if (!/<html[^>]* lang=/.test(dom)) {
    throw new Error(`${label}: no <html lang=…> element in the dumped DOM`)
  }
  if (dom.includes('animate-pulse')) {
    throw new Error(`${label}: the hydrate fallback splash is still rendered`)
  }
  if (!dom.includes('name="csrf_token"')) {
    throw new Error(`${label}: no hidden csrf_token input — the SPA did not hydrate into the login form`)
  }
  if (!dom.includes('type="submit"')) {
    throw new Error(`${label}: no submit button in the login form`)
  }
  return 'lang element, hydrated login form (csrf_token input + submit), no fallback'
}

function assertHydratedSetupForm(dom: string, label: string): string {
  if (!/<html[^>]* lang=/.test(dom)) {
    throw new Error(`${label}: no <html lang=…> element in the dumped DOM`)
  }
  if (dom.includes('animate-pulse')) {
    throw new Error(`${label}: the hydrate fallback splash is still rendered`)
  }
  if (!dom.includes('name="setup_token"')) {
    throw new Error(`${label}: no setup_token input — the SPA did not hydrate into the setup-token form`)
  }
  if (!dom.includes('name="csrf_token"')) {
    throw new Error(`${label}: no hidden csrf_token input in the setup form`)
  }
  if (!dom.includes('type="submit"')) {
    throw new Error(`${label}: no submit button in the setup form`)
  }
  if (dom.includes('name="password"')) {
    throw new Error(`${label}: ended on the login form instead of the setup-token form`)
  }
  return 'lang element, hydrated setup-token form (setup_token + csrf_token inputs + submit), no fallback'
}

async function check(name: string, fn: () => string | undefined | Promise<string | undefined>): Promise<boolean> {
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

async function bootNode(
  command: string,
  baseArgs: string[],
  args: string[],
  env: Record<string, string>,
  cwd: string,
  port: number,
  logPath: string,
): Promise<RunningServer> {
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(command, [...baseArgs, ...args], {
    cwd,
    env: { ...scrubbedParentEnv(), NODE_ENV: 'production', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  return { child, exitState: watchChildExit(child), port, logPath }
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.exitState.exited) {
    return
  }
  server.child.kill('SIGTERM')
  const outcome = await raceChildExit(server.child, server.exitState, SHUTDOWN_TIMEOUT_MS)
  if (outcome.timeout) {
    throw new Error(`server on port ${server.port} did not stop within ${SHUTDOWN_TIMEOUT_MS / 1000}s`)
  }
}

function stripCsrfTokens(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCsrfTokens)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'csrfToken')
        .map(([key, entry]) => [key, stripCsrfTokens(entry)]),
    )
  }
  return value
}

async function postRpc(
  origin: string,
  path: string,
  headers: Record<string, string> = {},
  input: unknown = {},
): Promise<Response> {
  return fetch(`${origin}/rpc${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(10_000),
  })
}

function strongEtag(value: string): string {
  return value.startsWith('W/') ? value.slice(2) : value
}

function restrictResourceRateLimit(databasePath: string): void {
  const restrictive = { ...rateLimitDefaults, resource: { windowSeconds: 60, maxAttempts: 1 } }
  const db = new DatabaseSync(databasePath)
  try {
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.rateLimit', ?, ?, NULL)
       ON CONFLICT ("scope") DO UPDATE SET "data" = excluded."data"`,
    ).run(JSON.stringify(restrictive), Date.now())
  } finally {
    db.close()
  }
}

function disableWebmentionReceive(databasePath: string): void {
  const db = new DatabaseSync(databasePath)
  try {
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.webmentions', ?, ?, NULL)
       ON CONFLICT ("scope") DO UPDATE SET "data" = excluded."data"`,
    ).run(JSON.stringify({ webmention: { receiveEnabled: false, displayOnPosts: true } }), Date.now())
  } finally {
    db.close()
  }
}

interface CookieJar {
  header(): string | undefined
  store(res: Response): void
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>()
  return {
    header() {
      if (cookies.size === 0) {
        return undefined
      }
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
    },
    store(res: Response) {
      for (const setCookie of res.headers.getSetCookie()) {
        const pair = setCookie.split(';')[0] ?? ''
        const eq = pair.indexOf('=')
        if (eq > 0) {
          cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
        }
      }
    },
  }
}

interface SeededPost {
  id: string
  slug: string
  title: string
  scopedSlug: string
  categorySlug: string
  tagSlug: string
}

async function seedSmokePost(origin: string, email: string, password: string): Promise<SeededPost> {
  const jar = createCookieJar()
  const send = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    const cookie = jar.header()
    if (cookie !== undefined) {
      headers.set('cookie', cookie)
    }
    const res = await fetch(`${origin}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    jar.store(res)
    return res
  }
  const bootstrap = await send('/rpc/public/content/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: {} }),
  })
  if (bootstrap.status !== 200) {
    throw new Error(`bootstrap returned ${bootstrap.status}`)
  }
  const bootEnvelope: unknown = await bootstrap.json()
  const csrfToken =
    isRecord(bootEnvelope) && isRecord(bootEnvelope.json) && typeof bootEnvelope.json.csrfToken === 'string'
      ? bootEnvelope.json.csrfToken
      : null
  if (csrfToken === null) {
    throw new Error('bootstrap carried no csrfToken')
  }
  const login = await send('/rpc/account/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ json: { email, password, redirectTo: '/admin' } }),
  })
  if (login.status !== 200) {
    throw new Error(`account.auth.login returned ${login.status}`)
  }
  const loginEnvelope: unknown = await login.json()
  if (!isRecord(loginEnvelope) || !isRecord(loginEnvelope.json) || loginEnvelope.json.type !== 'redirect') {
    throw new Error('account.auth.login did not answer the redirect flow result')
  }
  const reBootstrap = await send('/rpc/public/content/bootstrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: {} }),
  })
  if (reBootstrap.status !== 200) {
    throw new Error(`post-login bootstrap returned ${reBootstrap.status}`)
  }
  const reBootEnvelope: unknown = await reBootstrap.json()
  const adminCsrf =
    isRecord(reBootEnvelope) && isRecord(reBootEnvelope.json) && typeof reBootEnvelope.json.csrfToken === 'string'
      ? reBootEnvelope.json.csrfToken
      : null
  if (adminCsrf === null) {
    throw new Error('post-login bootstrap carried no csrfToken')
  }
  const post: SeededPost = {
    id: '',
    slug: `split-smoke-${randomBytes(4).toString('hex')}`,
    title: 'Split Smoke Post',
    scopedSlug: `split-smoke-scoped-${randomBytes(4).toString('hex')}`,
    categorySlug: 'smoke-cat',
    tagSlug: 'smoke-tag',
  }
  const upsert = await send('/rpc/admin/posts/upsertMeta', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({
      json: {
        title: post.title,
        slug: post.slug,
        summary: 'Split smoke summary',
        cover: SMOKE_COVER_DATA_URI,
        published: true,
        publishedAt: new Date().toISOString(),
      },
    }),
  })
  if (upsert.status !== 200) {
    throw new Error(`upsertMeta returned ${upsert.status}`)
  }
  const envelope: unknown = await upsert.json()
  const created =
    isRecord(envelope) && isRecord(envelope.json) && isRecord(envelope.json.post) ? envelope.json.post : null
  if (created === null || (typeof created.id !== 'string' && typeof created.id !== 'number')) {
    throw new Error('upsertMeta response carried no post id')
  }
  post.id = String(created.id)
  const publish = await send('/rpc/admin/posts/publishLatest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({ json: { id: post.id, body: smokeLexicalBody() } }),
  })
  if (publish.status !== 200) {
    throw new Error(`publishLatest returned ${publish.status}`)
  }
  const publishEnvelope: unknown = await publish.json()
  if (!isRecord(publishEnvelope) || !isRecord(publishEnvelope.json) || publishEnvelope.json.status !== 'saved') {
    throw new Error('publishLatest did not save the published revision')
  }
  const categoryUpsert = await send('/rpc/admin/categories/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({
      json: { name: 'Smoke Cat', slug: post.categorySlug, cover: SMOKE_COVER_DATA_URI, description: 'Smoke category' },
    }),
  })
  if (categoryUpsert.status !== 200) {
    throw new Error(`admin.categories.upsert returned ${categoryUpsert.status}`)
  }
  const categoryEnvelope: unknown = await categoryUpsert.json()
  const category =
    isRecord(categoryEnvelope) && isRecord(categoryEnvelope.json) && isRecord(categoryEnvelope.json.category)
      ? categoryEnvelope.json.category
      : null
  if (category === null || typeof category.id !== 'string') {
    throw new Error('admin.categories.upsert carried no category id')
  }
  const tagUpsert = await send('/rpc/admin/tags/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({ json: { name: 'Smoke Tag', slug: post.tagSlug } }),
  })
  if (tagUpsert.status !== 200) {
    throw new Error(`admin.tags.upsert returned ${tagUpsert.status}`)
  }
  const scoped = await send('/rpc/admin/posts/upsertMeta', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({
      json: {
        title: 'Split Smoke Scoped Post',
        slug: post.scopedSlug,
        summary: 'Split smoke scoped summary',
        cover: SMOKE_COVER_DATA_URI,
        published: true,
        publishedAt: new Date().toISOString(),
        categoryId: Number(category.id),
        tags: ['Smoke Tag'],
      },
    }),
  })
  if (scoped.status !== 200) {
    throw new Error(`scoped upsertMeta returned ${scoped.status}`)
  }
  const scopedEnvelope: unknown = await scoped.json()
  const scopedPost =
    isRecord(scopedEnvelope) && isRecord(scopedEnvelope.json) && isRecord(scopedEnvelope.json.post)
      ? scopedEnvelope.json.post
      : null
  if (scopedPost === null || (typeof scopedPost.id !== 'string' && typeof scopedPost.id !== 'number')) {
    throw new Error('scoped upsertMeta carried no post id')
  }
  const scopedPublish = await send('/rpc/admin/posts/publishLatest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
    body: JSON.stringify({ json: { id: String(scopedPost.id), body: smokeLexicalBody() } }),
  })
  if (scopedPublish.status !== 200) {
    throw new Error(`scoped publishLatest returned ${scopedPublish.status}`)
  }
  return post
}

function smokeLexicalBody(): Record<string, unknown> {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          children: [
            {
              type: 'extended-text',
              version: 1,
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'Split smoke body.',
            },
          ],
        },
      ],
    },
  }
}

async function main(): Promise<void> {
  for (const artifact of SEA_MODE ? [kobatoBinary, sayakaBinary] : [kobatoNodeEntry, sayakaNodeEntry]) {
    await stat(artifact).catch(() => {
      throw new Error(`${artifact} not found — run ${SEA_MODE ? 'pnpm run sea:build' : 'pnpm run build'} first`)
    })
  }
  const kobatoIdentity = readAppIdentity('kobato')
  const sayakaIdentity = readAppIdentity('sayaka')
  console.log(`    mode: ${SEA_MODE ? 'SEA binaries (dist-sea)' : 'node builds (build/server)'}`)

  const dirs = await makeTempDirs()
  smokeState.tempRoot = dirs.root
  await mkdir(join(dirs.data, 'storage/fonts', SMOKE_FONT_HASH), { recursive: true })
  await writeFile(join(dirs.data, 'storage/fonts', SMOKE_FONT_HASH, 'chunk-001.woff2'), SMOKE_FONT_BYTES)
  await mkdir(join(dirs.data, 'storage/images'), { recursive: true })
  await writeFile(join(dirs.data, 'storage/images/split-smoke.jpg'), SMOKE_STORAGE_BYTES)
  await mkdir(join(dirs.data, 'storage/branding'), { recursive: true })
  await writeFile(join(dirs.data, 'storage/branding/smoke-logo.svg'), SMOKE_SVG_BODY)
  const databases = smokeDatabases(dirs)
  const configPath = join(dirs.root, 'kobato.config.json')
  const kobatoPort = await pickFreePort()
  const sayakaPort = await pickFreePort()
  const kobatoOrigin = `http://127.0.0.1:${kobatoPort}`
  const sayakaOrigin = `http://127.0.0.1:${sayakaPort}`
  const kobatoLog = join(dirs.root, 'kobato.log')
  const sayakaLog = join(dirs.root, 'sayaka.log')

  console.log(`    kobato:  ${kobatoOrigin} (log: ${kobatoLog})`)
  console.log(`    sayaka:  ${sayakaOrigin} (log: ${sayakaLog})`)
  console.log(`    temp dir: ${dirs.root}`)

  let kobato: RunningServer | null = null
  let sayaka: RunningServer | null = null
  let keepTemp = false

  try {
    if (SEA_MODE) {
      await check(`dist-sea/kobato --version prints the ${kobatoIdentity.name} identity and exits zero`, async () => {
        return checkBinaryVersion(kobatoBinary, kobatoIdentity)
      })
      await check(`dist-sea/sayaka --version prints the ${sayakaIdentity.name} identity and exits zero`, async () => {
        return checkBinaryVersion(sayakaBinary, sayakaIdentity)
      })
    }
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          server: { host: '127.0.0.1', port: kobatoPort, loggingLevel: 'info' },
          security: {
            sessionSecret: randomBytes(48).toString('hex'),
            encryptionKey: randomBytes(48).toString('hex'),
            trustedProxies: [],
          },
          storage: {
            data: dirs.data,
            database: databases.database,
            analyticsDatabase: databases.analytics,
            defaultFont: '',
          },
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    )
    kobato = await bootNode(
      kobatoCommand,
      kobatoBaseArgs,
      ['--config', configPath],
      {},
      dirs.cwd,
      kobatoPort,
      kobatoLog,
    )
    smokeState.kobato = kobato
    const kobatoGate = await waitForHttp(`${kobatoOrigin}/health`, kobato.exitState)
    if (kobatoGate.status !== 303) {
      throw new Error(`expected kobato /health 303 on a fresh instance, got ${kobatoGate.status}`)
    }
    sayaka = await bootNode(
      sayakaCommand,
      sayakaBaseArgs,
      [],
      {
        SAYAKA_HOST: '127.0.0.1',
        SAYAKA_PORT: String(sayakaPort),
        SAYAKA_KOBATO_RPC_URL: `${kobatoOrigin}/rpc`,
      },
      dirs.cwd,
      sayakaPort,
      sayakaLog,
    )
    smokeState.sayaka = sayaka
    const sayakaGate = await waitForHttp(`${sayakaOrigin}/`, sayaka.exitState)
    if (sayakaGate.status !== 303) {
      throw new Error(`expected sayaka / 303 on a fresh instance, got ${sayakaGate.status}`)
    }

    await check('uninstalled: sayaka / redirects to /admin/setup', async () => {
      const res = await fetchManual(`${sayakaOrigin}/`)
      if (res.status !== 303 || new URL(res.headers.get('location') ?? '', sayakaOrigin).pathname !== '/admin/setup') {
        throw new Error(`got ${res.status} location=${res.headers.get('location') ?? '(none)'}`)
      }
      return '303 → /admin/setup'
    })
    await check('uninstalled: /admin/setup serves through sayaka with only reachable assets', async () => {
      const res = await fetchManual(`${sayakaOrigin}/admin/setup`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      const body = await res.text()
      const urls = [
        ...new Set([...body.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g)].map((match) => match[1]!)),
      ]
      if (urls.length === 0) {
        throw new Error('no /admin/assets/* references in the setup shell')
      }
      for (const url of urls) {
        const asset = await fetchManual(`${sayakaOrigin}${url}`)
        if (asset.status !== 200) {
          throw new Error(`${url} answered ${asset.status} through sayaka on the uninstalled instance`)
        }
      }
      return `200, ${urls.length} asset(s) reachable`
    })
    await check(
      'uninstalled: the setup shell branding answers 200 with image content types through sayaka',
      async () => {
        const cases: Array<[string, string]> = [
          ['/logo-large.svg', 'image/svg+xml'],
          ['/logo-large-dark.svg', 'image/svg+xml'],
          ['/favicon.svg', 'image/svg+xml'],
          ['/favicon.ico', 'image/x-icon'],
          ['/apple-touch-icon.png', 'image/png'],
        ]
        for (const [path, contentType] of cases) {
          const res = await fetch(`${sayakaOrigin}${path}`, {
            headers: { 'sec-fetch-dest': 'image' },
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          })
          if (res.status !== 200) {
            throw new Error(`${path} answered ${res.status} while no admin exists`)
          }
          if (res.headers.get('content-type') !== contentType) {
            throw new Error(`${path} content-type ${res.headers.get('content-type')}, expected ${contentType}`)
          }
        }
        return `5 branding asset(s) 200 pre-install`
      },
    )

    if (existsSync(HEADLESS_CHROME)) {
      await check('browser: uninstalled sayaka /admin/setup hydrates into the setup-token form', async () => {
        const dom = await dumpDom(sayakaOrigin, '/admin/setup', dirs.root)
        return assertHydratedSetupForm(dom, 'uninstalled sayaka /admin/setup')
      })
      await check('browser: uninstalled sayaka /admin/setup renders the brand logo images', async () => {
        const dom = await dumpDom(sayakaOrigin, '/admin/setup', dirs.root)
        if (!dom.includes('src="/logo-large.svg"')) {
          throw new Error('no /logo-large.svg <img> in the hydrated setup DOM')
        }
        if (!dom.includes('src="/logo-large-dark.svg"')) {
          throw new Error('no /logo-large-dark.svg <img> in the hydrated setup DOM')
        }
        return 'both logo imgs rendered in the hydrated setup DOM'
      })
      await check('browser: uninstalled kobato /admin/setup hydrates into the setup-token form', async () => {
        const dom = await dumpDom(kobatoOrigin, '/admin/setup', dirs.root)
        return assertHydratedSetupForm(dom, 'uninstalled kobato /admin/setup')
      })
      await check('browser: uninstalled /admin/signin ends on the setup-token form, not a redirect loop', async () => {
        const dom = await dumpDom(sayakaOrigin, '/admin/signin', dirs.root)
        return assertHydratedSetupForm(dom, 'uninstalled /admin/signin')
      })
    } else {
      console.log(`  SKIP  uninstalled-instance browser checks — no headless Chrome at ${HEADLESS_CHROME}`)
    }

    await stopServer(kobato)
    const adminEmail = 'split-smoke@example.com'
    const adminPassword = randomBytes(12).toString('hex')
    await seedInstalledInstance(databases.database, {
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })
    kobato = await bootNode(
      kobatoCommand,
      kobatoBaseArgs,
      ['--config', configPath],
      {},
      dirs.cwd,
      kobatoPort,
      kobatoLog,
    )
    smokeState.kobato = kobato
    const seededHealth = await waitForHttp(`${kobatoOrigin}/health`, kobato.exitState)
    if (seededHealth.status !== 200) {
      throw new Error(`expected kobato /health 200 after seeding, got ${seededHealth.status}`)
    }

    await check("kobato's own origin answers 404 for every former public document and resource URL", async () => {
      for (const path of [
        '/',
        '/archives',
        '/posts/anything',
        '/feed',
        '/feed/atom',
        '/sitemap.xml',
        '/robots.txt',
        '/manifest.webmanifest',
        '/tags',
        '/search',
        '/cats/anything/feed',
        '/webmention',
        '/api/rum/intake/rum',
      ]) {
        const res = await fetchManual(`${kobatoOrigin}${path}`)
        if (res.status !== 404) {
          throw new Error(`${path} answered ${res.status} on kobato's origin, expected 404`)
        }
      }
      return '13 paths, all 404'
    })
    await check(
      "kobato's /admin/signin SPA shell: no-store CSP whose nonce matches its inline scripts, assets reachable",
      async () => {
        const res = await fetchManual(`${kobatoOrigin}/admin/signin`)
        if (res.status !== 200) {
          throw new Error(`got ${res.status}`)
        }
        if (res.headers.get('cache-control') !== 'no-store') {
          throw new Error(`Cache-Control is ${res.headers.get('cache-control') ?? '(none)'}, expected no-store`)
        }
        const body = await res.text()
        const csp = res.headers.get('content-security-policy')
        const headerNonce = /'nonce-([^']+)'/.exec(csp ?? '')?.[1]
        if (headerNonce === undefined) {
          throw new Error(`no nonce in CSP: ${csp ?? '(none)'}`)
        }
        const scriptNonces = [...body.matchAll(/<script[^>]*\snonce="([^"]+)"/g)].map((match) => match[1])
        if (scriptNonces.length === 0) {
          throw new Error('no nonce-bearing <script> tag in the shell document')
        }
        if (!scriptNonces.every((nonce) => nonce === headerNonce)) {
          throw new Error(`script nonces ${scriptNonces.join(',')} do not match CSP nonce ${headerNonce}`)
        }
        const urls = [
          ...new Set([...body.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g)].map((match) => match[1]!)),
        ]
        if (urls.length === 0) {
          throw new Error('no /admin/assets/* references in the shell document')
        }
        for (const url of urls) {
          const asset = await fetchManual(`${kobatoOrigin}${url}`)
          if (asset.status !== 200) {
            throw new Error(`${url} answered ${asset.status} on kobato's own origin`)
          }
        }
        return `nonce ${headerNonce}, ${urls.length} asset(s) 200 from kobato`
      },
    )
    await check("kobato's /editor/post/new answers the SPA shell", async () => {
      const res = await fetchManual(`${kobatoOrigin}/editor/post/new`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      if (!/<!DOCTYPE html>/i.test(await res.text())) {
        throw new Error('/editor/post/new did not answer an HTML shell')
      }
      return '200 shell'
    })
    await check('through sayaka: /admin/signin answers the shell and every referenced asset answers 200', async () => {
      const res = await fetchManual(`${sayakaOrigin}/admin/signin`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      const body = await res.text()
      if (!/<!DOCTYPE html>/i.test(body)) {
        throw new Error('sayaka-forwarded /admin/signin did not answer an HTML shell')
      }
      const urls = [
        ...new Set([...body.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g)].map((match) => match[1]!)),
      ]
      if (urls.length === 0) {
        throw new Error('no /admin/assets/* references in the forwarded shell')
      }
      for (const url of urls) {
        const asset = await fetchManual(`${sayakaOrigin}${url}`)
        if (asset.status !== 200) {
          throw new Error(`${url} answered ${asset.status} through sayaka`)
        }
      }
      return `shell + ${urls.length} asset(s) 200 through sayaka`
    })

    let homeEtag: string | null = null
    let homeHtml: string | null = null
    await check(
      'installed: sayaka / serves the home document with CSP nonce, ETag and relayed __csrf cookie',
      async () => {
        const res = await fetchManual(`${sayakaOrigin}/`)
        if (res.status !== 200) {
          throw new Error(`got ${res.status}`)
        }
        const body = await res.text()
        const csp = res.headers.get('content-security-policy')
        if (csp === null) {
          throw new Error('no content-security-policy header')
        }
        const headerNonce = /'nonce-([^']+)'/.exec(csp)?.[1]
        if (headerNonce === undefined) {
          throw new Error(`no nonce in CSP: ${csp}`)
        }
        const scriptNonces = [...body.matchAll(/<script[^>]*\snonce="([^"]+)"/g)].map((match) => match[1])
        if (scriptNonces.length === 0) {
          throw new Error('no nonce-bearing <script> tag in the document')
        }
        if (!scriptNonces.every((nonce) => nonce === headerNonce)) {
          throw new Error(`script nonces ${scriptNonces.join(',')} do not match CSP nonce ${headerNonce}`)
        }
        const etag = res.headers.get('etag')
        if (etag === null) {
          throw new Error('no ETag header')
        }
        homeEtag = etag
        homeHtml = body
        if (!res.headers.getSetCookie().some((cookie) => cookie.startsWith('__csrf='))) {
          throw new Error('no relayed __csrf Set-Cookie on anonymous first contact')
        }
        return `200, nonce ${headerNonce}, ETag ${etag}`
      },
    )
    await check(
      'every /assets/* URL on the home document answers 200 with the one-year fingerprint cache',
      async () => {
        if (homeHtml === null) {
          throw new Error('skipped: no home document captured')
        }
        const urls = [...new Set([...homeHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]!))]
        if (urls.length === 0) {
          throw new Error('no /assets/* references found in the home document')
        }
        for (const url of urls) {
          const res = await fetchManual(`${sayakaOrigin}${url}`)
          if (res.status !== 200) {
            throw new Error(`${url} answered ${res.status}`)
          }
          const cacheControl = res.headers.get('cache-control') ?? ''
          if (!cacheControl.includes('max-age=31536000')) {
            throw new Error(`${url} Cache-Control is ${cacheControl === '' ? '(none)' : cacheControl}`)
          }
        }
        return `${urls.length} assets, all cached for a year`
      },
    )
    await check('conditional home request returns 304 without a CSP header', async () => {
      if (homeEtag === null) {
        throw new Error('skipped: no ETag captured from the home document')
      }
      const res = await fetch(`${sayakaOrigin}/`, {
        headers: { 'if-none-match': homeEtag },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status !== 304) {
        throw new Error(`got ${res.status}`)
      }
      if (res.headers.get('content-security-policy') !== null) {
        throw new Error('304 response still carries a content-security-policy header')
      }
      return '304, CSP stripped'
    })
    await check('/page/1 redirects to /', async () => {
      const res = await fetchManual(`${sayakaOrigin}/page/1`)
      const location = res.headers.get('location')
      if (res.status !== 302 || new URL(location ?? '', sayakaOrigin).pathname !== '/') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      return '302 → /'
    })
    await check(
      'home document preloads its critical chunks and carries the inline route-warmup idle script',
      async () => {
        if (homeHtml === null) {
          throw new Error('skipped: no home document captured')
        }
        const modulepreloadLink =
          /<link\b[^>]*rel="modulepreload"[^>]*href="\/assets\//.test(homeHtml) ||
          /<link\b[^>]*href="\/assets\/[^"]*"[^>]*rel="modulepreload"/.test(homeHtml)
        if (!modulepreloadLink) {
          throw new Error('no <link rel="modulepreload" href="/assets/..."> in the home document')
        }
        const warmupScript = [...homeHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].some(
          ([, attrs, body]) => attrs.includes('nonce="') && body.includes('modulepreload') && body.includes('/assets/'),
        )
        if (!warmupScript) {
          throw new Error('no inline nonce-bearing <script> holding the route-warmup idle loader')
        }
        return 'modulepreload links + inline warmup idle script'
      },
    )
    await check('/tags redirects to / (301, served by sayaka)', async () => {
      const res = await fetchManual(`${sayakaOrigin}/tags`)
      const location = res.headers.get('location')
      if (res.status !== 301 || new URL(location ?? '', sayakaOrigin).pathname !== '/') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      return '301 → /'
    })
    await check('/search?q=kobato redirects to /search/kobato (301, served by sayaka)', async () => {
      const res = await fetchManual(`${sayakaOrigin}/search?q=kobato`)
      const location = res.headers.get('location')
      if (res.status !== 301 || new URL(location ?? '', sayakaOrigin).pathname !== '/search/kobato') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      return '301 → /search/kobato'
    })
    await check('/search without a query redirects to / (301, served by sayaka)', async () => {
      const res = await fetchManual(`${sayakaOrigin}/search`)
      const location = res.headers.get('location')
      if (res.status !== 301 || new URL(location ?? '', sayakaOrigin).pathname !== '/') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      return '301 → /'
    })
    await check('unknown category/tag/post/page slugs answer 404 through sayaka', async () => {
      for (const path of ['/cats/does-not-exist', '/tags/does-not-exist', '/posts/does-not-exist', '/does-not-exist']) {
        const res = await fetchManual(`${sayakaOrigin}${path}`)
        if (res.status !== 404) {
          throw new Error(`${path} answered ${res.status}, expected 404`)
        }
      }
      return '4 paths, all 404'
    })
    await check('/archives and /categories serve 200 with an ETag through sayaka', async () => {
      for (const path of ['/archives', '/categories']) {
        const res = await fetchManual(`${sayakaOrigin}${path}`)
        if (res.status !== 200) {
          throw new Error(`${path} answered ${res.status}`)
        }
        if (res.headers.get('etag') === null) {
          throw new Error(`${path} carries no ETag header`)
        }
      }
      return '200 + ETag on both'
    })
    let seededPost: SeededPost | null = null
    await check('admin signin + upsertMeta on kobato seeds a published post', async () => {
      seededPost = await seedSmokePost(kobatoOrigin, adminEmail, adminPassword)
      return `slug /posts/${seededPost.slug}`
    })
    let seededPostEtag: string | null = null
    await check('seeded post detail at sayaka: 200 with the post title, Content-Language and ETag', async () => {
      if (seededPost === null) {
        throw new Error('skipped: post seeding failed')
      }
      const res = await fetchManual(`${sayakaOrigin}/posts/${seededPost.slug}`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      const body = await res.text()
      if (!body.includes(seededPost.title)) {
        throw new Error(`post title ${seededPost.title} missing from the detail document`)
      }
      const contentLanguage = res.headers.get('content-language')
      if (contentLanguage === null) {
        throw new Error('no Content-Language header')
      }
      const etag = res.headers.get('etag')
      if (etag === null) {
        throw new Error('no ETag header')
      }
      seededPostEtag = etag
      return `200, Content-Language ${contentLanguage}, ETag ${etag}`
    })
    await check('conditional seeded post request at sayaka returns 304', async () => {
      if (seededPost === null || seededPostEtag === null) {
        throw new Error('skipped: no seeded post ETag captured')
      }
      const res = await fetch(`${sayakaOrigin}/posts/${seededPost.slug}`, {
        headers: { 'if-none-match': seededPostEtag },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status !== 304) {
        throw new Error(`got ${res.status}`)
      }
      return '304'
    })

    await check('POST /webmention through sayaka answers the same bodies kobato answered', async () => {
      if (seededPost === null) {
        throw new Error('skipped: post seeding failed')
      }
      const formPost = (params: Record<string, string>, body?: string): Promise<Response> =>
        fetch(`${sayakaOrigin}/webmention`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: body ?? new URLSearchParams(params).toString(),
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
      const invalid = await formPost({ source: 'not-a-url', target: `http://127.0.0.1/posts/${seededPost.slug}` })
      if (invalid.status !== 400 || (await invalid.text()) !== INVALID_WEBMENTION_BODY) {
        throw new Error(`invalid form answered ${invalid.status}`)
      }
      const accepted = await formPost({
        source: 'https://sender.example/blog/mentioning',
        target: `http://127.0.0.1/posts/${seededPost.slug}`,
      })
      if (accepted.status !== 202 || (await accepted.text()) !== '{"status":"pending"}') {
        throw new Error(`valid mention answered ${accepted.status}`)
      }
      const queued = await formPost({
        source: 'https://sender.example/blog/mentioning',
        target: 'http://127.0.0.1/posts/does-not-exist',
      })
      const queuedPayload: unknown = await queued.json()
      const queuedMessage =
        isRecord(queuedPayload) && isRecord(queuedPayload.error) && typeof queuedPayload.error.message === 'string'
          ? queuedPayload.error.message
          : undefined
      if (queued.status !== 404 || queuedMessage !== 'target is not a resource on this site') {
        throw new Error(`unknown target answered ${queued.status}`)
      }
      const oversized = await formPost({ source: 'a', target: 'b' }, 'x'.repeat(20 * 1024))
      if (oversized.status !== 413 || (await oversized.text()) !== OVERSIZED_WEBMENTION_BODY) {
        throw new Error(`oversized form answered ${oversized.status}`)
      }
      return 'invalid 400, valid 202 pending, unknown target 404, oversized 413 — byte-identical bodies'
    })
    await check('RUM intake through sayaka answers the captured disabled 404 and the compressed 415', async () => {
      const rumPost = (init: RequestInit): Promise<Response> =>
        fetch(`${sayakaOrigin}/api/rum/intake/rum/v1/default/rum?o2-api-key=forged`, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          ...init,
        })
      const disabled = await rumPost({ body: '{"type":"view"}' })
      if (
        disabled.status !== 404 ||
        disabled.headers.get('cache-control') !== 'no-store' ||
        (await disabled.text()) !== RUM_DISABLED_BODY
      ) {
        throw new Error(`relay-inactive intake answered ${disabled.status}`)
      }
      const compressed = await rumPost({ body: '{}', headers: { 'content-encoding': 'gzip' } })
      if (
        compressed.status !== 415 ||
        compressed.headers.get('cache-control') !== 'no-store' ||
        (await compressed.text()) !== RUM_COMPRESSED_BODY
      ) {
        throw new Error(`compressed intake answered ${compressed.status}`)
      }
      return '404 no-store while the relay is inactive, 415 no-store for a gzip batch'
    })

    let feedEtag: string | null = null
    await check(
      'feeds served by sayaka are byte-identical to the public.feeds procedure answers (all, atom, category, tag)',
      async () => {
        if (seededPost === null) {
          throw new Error('skipped: post seeding failed')
        }
        const cases = [
          { path: '/feed', rpc: '/public/feeds/rss', input: {} },
          { path: '/feed/atom', rpc: '/public/feeds/atom', input: {} },
          {
            path: `/cats/${seededPost.categorySlug}/feed`,
            rpc: '/public/feeds/rss',
            input: { category: seededPost.categorySlug },
          },
          {
            path: `/tags/${seededPost.tagSlug}/feed/atom`,
            rpc: '/public/feeds/atom',
            input: { tag: seededPost.tagSlug },
          },
        ]
        for (const item of cases) {
          const page = await fetchManual(`${sayakaOrigin}${item.path}`)
          if (page.status !== 200) {
            throw new Error(`${item.path} answered ${page.status}`)
          }
          const wire = await postRpc(kobatoOrigin, item.rpc, {}, item.input)
          if (wire.status !== 200) {
            throw new Error(`${item.rpc} answered ${wire.status}`)
          }
          const envelope: unknown = await wire.json()
          const answer = isRecord(envelope) && isRecord(envelope.json) ? envelope.json : null
          if (
            answer === null ||
            answer.kind !== 'ok' ||
            typeof answer.body !== 'string' ||
            typeof answer.etag !== 'string' ||
            typeof answer.contentType !== 'string'
          ) {
            throw new Error(`${item.rpc} did not answer an ok resource signal`)
          }
          if (page.headers.get('content-type') !== answer.contentType) {
            throw new Error(
              `${item.path} content-type ${page.headers.get('content-type')}, procedure named ${answer.contentType}`,
            )
          }
          const pageBody = await page.text()
          if (pageBody !== answer.body) {
            throw new Error(`${item.path} body diverged from the ${item.rpc} answer`)
          }
          if (page.headers.get('etag') === null || strongEtag(page.headers.get('etag')!) !== strongEtag(answer.etag)) {
            throw new Error(`${item.path} etag ${page.headers.get('etag')} vs procedure ${answer.etag}`)
          }
          if (answer.body.includes(seededPost.scopedSlug) === false) {
            throw new Error(`${item.path} body does not contain the category/tag-scoped post`)
          }
        }
        const fresh = await fetchManual(`${sayakaOrigin}/feed`)
        feedEtag = fresh.headers.get('etag')
        return '4 feeds byte-identical to their procedure answers (200 etags arrive as the weak form of the strong tag)'
      },
    )
    await check('conditional feed request at sayaka answers 304 with the etag', async () => {
      if (feedEtag === null) {
        throw new Error('skipped: no feed ETag captured')
      }
      const res = await fetch(`${sayakaOrigin}/feed`, {
        headers: { 'if-none-match': feedEtag },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status !== 304) {
        throw new Error(`got ${res.status}`)
      }
      if (res.headers.get('etag') === null) {
        throw new Error('304 carries no etag')
      }
      return '304 with etag'
    })
    await check('/sitemap.xml served by sayaka matches the public.sitemap.xml procedure answer', async () => {
      const page = await fetchManual(`${sayakaOrigin}/sitemap.xml`)
      if (page.status !== 200) {
        throw new Error(`got ${page.status}`)
      }
      const wire = await postRpc(kobatoOrigin, '/public/sitemap/xml')
      if (wire.status !== 200) {
        throw new Error(`procedure answered ${wire.status}`)
      }
      const envelope: unknown = await wire.json()
      const answer = isRecord(envelope) && isRecord(envelope.json) ? envelope.json : null
      if (answer === null || answer.kind !== 'ok' || typeof answer.body !== 'string') {
        throw new Error('procedure did not answer an ok resource signal')
      }
      const body = await page.text()
      if (body !== answer.body || !body.includes('<urlset')) {
        throw new Error('sitemap body diverged from the procedure answer')
      }
      if (page.headers.get('content-type') !== 'application/xml; charset=utf-8') {
        throw new Error(`content-type ${page.headers.get('content-type')}`)
      }
      if (
        page.headers.get('etag') === null ||
        strongEtag(page.headers.get('etag')!) !== strongEtag(String(answer.etag))
      ) {
        throw new Error('sitemap etag diverged from the procedure answer')
      }
      return 'body, content type, and etag match'
    })
    await check('a feed for an unknown scope answers 404 through sayaka', async () => {
      for (const path of ['/cats/does-not-exist/feed', '/tags/does-not-exist/feed/atom']) {
        const res = await fetchManual(`${sayakaOrigin}${path}`)
        if (res.status !== 404) {
          throw new Error(`${path} answered ${res.status}, expected 404`)
        }
      }
      return '2 scopes, both 404'
    })
    await check('/robots.txt served by sayaka answers the same body and headers kobato answered', async () => {
      const res = await fetchManual(`${sayakaOrigin}/robots.txt`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      const body = await res.text()
      if (body !== 'User-agent: *\nAllow: /\nSitemap: http://127.0.0.1/sitemap.xml') {
        throw new Error(`body drifted: ${JSON.stringify(body)}`)
      }
      if (res.headers.get('content-type') !== 'text/plain; charset=utf-8') {
        throw new Error(`content-type ${res.headers.get('content-type')}`)
      }
      if (res.headers.get('cache-control') !== 'public, max-age=3600, must-revalidate') {
        throw new Error(`cache-control ${res.headers.get('cache-control')}`)
      }
      if (res.headers.get('etag') !== null) {
        throw new Error('robots.txt must not carry an etag')
      }
      return '200, byte-identical body, text/plain + one-hour revalidation, no etag'
    })
    await check(
      '/manifest.webmanifest served by sayaka answers the same body and headers kobato answered',
      async () => {
        const res = await fetchManual(`${sayakaOrigin}/manifest.webmanifest`)
        if (res.status !== 200) {
          throw new Error(`got ${res.status}`)
        }
        const body = await res.text()
        const expected =
          '{"name":"Kobato Smoke","short_name":"Kobato Smoke","lang":"zh-CN","icons":[{"src":"/images/icon-192.png","type":"image/png","sizes":"192x192"},{"src":"/images/icon-512.png","type":"image/png","sizes":"512x512"}],"display":"standalone","theme_color":"#ffffff","background_color":"#ffffff"}'
        if (body !== expected) {
          throw new Error(`body drifted: ${body}`)
        }
        if (res.headers.get('content-type') !== 'application/json; charset=utf-8') {
          throw new Error(`content-type ${res.headers.get('content-type')}`)
        }
        if (res.headers.get('cache-control') !== 'public, no-cache') {
          throw new Error(`cache-control ${res.headers.get('cache-control')}`)
        }
        if (res.headers.get('content-language') !== 'zh-CN') {
          throw new Error(`content-language ${res.headers.get('content-language')}`)
        }
        const etag = res.headers.get('etag')
        if (etag === null || !/^[0-9a-f]{32}$/.test(strongEtag(etag).replaceAll('"', ''))) {
          throw new Error(`etag ${etag ?? '(none)'}`)
        }
        return '200, byte-identical body, json + no-cache + zh-CN + strong etag'
      },
    )
    await check(
      'branding assets referenced by the home document answer through sayaka with image content types',
      async () => {
        if (homeHtml === null) {
          throw new Error('skipped: no home document captured')
        }
        const urls = [
          ...new Set(
            [...homeHtml.matchAll(/(?:src|href)="(\/(?:favicon|logo|apple-touch|images\/icon)[^"]*)"/g)].map(
              (match) => match[1]!,
            ),
          ),
        ]
        if (urls.length === 0) {
          throw new Error('no branding asset references in the home document')
        }
        for (const url of urls) {
          const res = await fetchManual(`${sayakaOrigin}${url}`)
          if (res.status !== 200) {
            throw new Error(`${url} answered ${res.status}`)
          }
          if ((res.headers.get('content-type') ?? '').startsWith('image/') === false) {
            throw new Error(`${url} content-type ${res.headers.get('content-type')}`)
          }
        }
        return `${urls.length} branding asset(s) 200 with image content types`
      },
    )
    await check(
      '/favicon.svg through sayaka matches the pre-migration kobato bytes, headers, and 304 behavior',
      async () => {
        const res = await fetchManual(`${sayakaOrigin}/favicon.svg`)
        if (res.status !== 200) {
          throw new Error(`got ${res.status}`)
        }
        if (res.headers.get('content-type') !== 'image/svg+xml') {
          throw new Error(`content-type ${res.headers.get('content-type')}`)
        }
        if (res.headers.get('cache-control') !== 'public, max-age=3600, must-revalidate') {
          throw new Error(`cache-control ${res.headers.get('cache-control')}`)
        }
        const body = await res.arrayBuffer()
        const digest = createHash('sha256').update(new Uint8Array(body)).digest('hex')
        if (digest !== 'e766e1eeb9af8a33ba77619ad85685263623ab4c12973bc5ef96b2b94896087a') {
          throw new Error(`favicon bytes drifted: sha256 ${digest}`)
        }
        const etag = res.headers.get('etag')
        if (etag === null) {
          throw new Error('no etag on the favicon answer')
        }
        const conditional = await fetch(`${sayakaOrigin}/favicon.svg`, {
          headers: { 'if-none-match': etag },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (conditional.status !== 304) {
          throw new Error(`conditional favicon answered ${conditional.status}`)
        }
        return '200 byte-identical to the captured default svg + conditional 304'
      },
    )
    await check('/images/open-graph.png through sayaka answers the captured default branding PNG', async () => {
      const res = await fetchManual(`${sayakaOrigin}/images/open-graph.png`)
      if (res.status !== 200) {
        throw new Error(`got ${res.status}`)
      }
      if (res.headers.get('content-type') !== 'image/png') {
        throw new Error(`content-type ${res.headers.get('content-type')}`)
      }
      const digest = createHash('sha256')
        .update(new Uint8Array(await res.arrayBuffer()))
        .digest('hex')
      if (digest !== 'c4e02000c9e1a81b665f8f9727d998bbb4f812469e98431f90ed04244fabac36') {
        throw new Error(`default open-graph bytes drifted: sha256 ${digest}`)
      }
      return '200, byte-identical to the captured default'
    })
    await check(
      'OG images for the seeded post and category answer through sayaka byte-identical to their procedure answers',
      async () => {
        if (seededPost === null) {
          throw new Error('skipped: post seeding failed')
        }
        for (const [path, rpc] of [
          [`/images/og/${seededPost.slug}.png`, '/public/images/og'],
          [`/images/og/cats/${seededPost.categorySlug}.png`, '/public/images/og'],
        ] as const) {
          const page = await fetchManual(`${sayakaOrigin}${path}`)
          if (page.status !== 200) {
            throw new Error(`${path} answered ${page.status}`)
          }
          if (page.headers.get('content-type') !== 'image/png') {
            throw new Error(`${path} content-type ${page.headers.get('content-type')}`)
          }
          if (page.headers.get('cache-control') !== 'public, max-age=3600') {
            throw new Error(`${path} cache-control ${page.headers.get('cache-control')}`)
          }
          const again = await fetchManual(`${sayakaOrigin}${path}`)
          const againDigest = createHash('sha256')
            .update(new Uint8Array(await again.arrayBuffer()))
            .digest('hex')
          const firstDigest = createHash('sha256')
            .update(new Uint8Array(await page.clone().arrayBuffer()))
            .digest('hex')
          if (againDigest !== firstDigest) {
            throw new Error(`${path} render is not byte-stable`)
          }
          const input = path.includes('/cats/')
            ? { slug: seededPost.categorySlug, category: true }
            : { slug: seededPost.slug }
          const wire = await postRpc(kobatoOrigin, rpc, {}, input)
          if (wire.status !== 200) {
            throw new Error(`${rpc} answered ${wire.status}`)
          }
          const form = await wire.formData()
          const blob = form.get('0')
          if (!(blob instanceof Blob)) {
            throw new TypeError(`${rpc} carried no binary part`)
          }
          const wireBytes = new Uint8Array(await blob.arrayBuffer())
          const pageBytes = new Uint8Array(await page.arrayBuffer())
          if (
            wireBytes.length !== pageBytes.length ||
            createHash('sha256').update(wireBytes).digest('hex') !==
              createHash('sha256').update(pageBytes).digest('hex')
          ) {
            throw new Error(`${path} body diverged from the ${rpc} answer`)
          }
        }
        return 'post + category OG byte-identical to their procedure answers, byte-stable across renders'
      },
    )
    await check('OG fallback for an unknown slug redirects to the branding open-graph image', async () => {
      const res = await fetchManual(`${sayakaOrigin}/images/og/does-not-exist.png`)
      const location = res.headers.get('location')
      if (res.status !== 302 || new URL(location ?? '', sayakaOrigin).pathname !== '/images/open-graph.png') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      return '302 → /images/open-graph.png'
    })
    await check(
      'calendar image through sayaka is byte-identical to its procedure answer and answers a conditional 304',
      async () => {
        const page = await fetchManual(`${sayakaOrigin}/images/calendar/2026/0617.png`)
        if (page.status !== 200) {
          throw new Error(`got ${page.status}`)
        }
        if (page.headers.get('content-type') !== 'image/png') {
          throw new Error(`content-type ${page.headers.get('content-type')}`)
        }
        if (page.headers.get('cache-control') !== 'public, no-cache') {
          throw new Error(`cache-control ${page.headers.get('cache-control')}`)
        }
        if (page.headers.get('content-language') !== 'zh-CN') {
          throw new Error(`content-language ${page.headers.get('content-language')}`)
        }
        const etag = page.headers.get('etag')
        if (etag === null) {
          throw new Error('no etag on the calendar answer')
        }
        const wire = await postRpc(
          kobatoOrigin,
          '/public/images/calendar',
          {},
          { year: '2026', time: '0617', theme: 'light' },
        )
        const form = await wire.formData()
        const blob = form.get('0')
        if (!(blob instanceof Blob)) {
          throw new TypeError('procedure carried no binary part')
        }
        const wireDigest = createHash('sha256')
          .update(new Uint8Array(await blob.arrayBuffer()))
          .digest('hex')
        const pageDigest = createHash('sha256')
          .update(new Uint8Array(await page.arrayBuffer()))
          .digest('hex')
        if (wireDigest !== pageDigest) {
          throw new Error('calendar body diverged from the procedure answer')
        }
        const conditional = await fetch(`${sayakaOrigin}/images/calendar/2026/0617.png`, {
          headers: { 'if-none-match': etag },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (conditional.status !== 304 || conditional.headers.get('etag') === null) {
          throw new Error(`conditional calendar answered ${conditional.status}`)
        }
        const dark = await fetchManual(`${sayakaOrigin}/images/calendar/dark/2026/0617.png`)
        if (dark.status !== 200 || dark.headers.get('etag') === etag) {
          throw new Error(`dark calendar answered ${dark.status} with the light etag`)
        }
        const badDate = await fetchManual(`${sayakaOrigin}/images/calendar/2026/1332.png`)
        if (badDate.status !== 404) {
          throw new Error(`bad calendar date answered ${badDate.status}`)
        }
        return '200 byte-identical to the procedure answer, conditional 304, dark keyed independently, bad date 404'
      },
    )
    await check('avatar image through sayaka answers the default-avatar redirect for an unknown hash', async () => {
      const res = await fetchManual(`${sayakaOrigin}/images/avatar/abcdef0123456789.png?s=256`)
      const location = res.headers.get('location')
      if (res.status !== 302 || (location ?? '') !== '/images/default-avatar.png') {
        throw new Error(`got ${res.status} location=${location ?? '(none)'}`)
      }
      const defaultAvatar = await fetchManual(`${sayakaOrigin}/images/default-avatar.png`)
      if (defaultAvatar.status !== 200 || defaultAvatar.headers.get('content-type') !== 'image/png') {
        throw new Error(`default avatar answered ${defaultAvatar.status}`)
      }
      const noPng = await fetchManual(`${sayakaOrigin}/images/avatar/abcdef0123456789.jpg`)
      if (noPng.status !== 404) {
        throw new Error(`non-png avatar answered ${noPng.status}`)
      }
      return '302 → /images/default-avatar.png, default served, non-png 404'
    })
    await check(
      'embedded font through sayaka streams with immutable caching, exact ranges, a conditional 304, and a 416',
      async () => {
        const path = `/fonts/embedded/${SMOKE_FONT_HASH}/chunk-001.woff2`
        const page = await fetchManual(`${sayakaOrigin}${path}`)
        if (page.status !== 200) {
          throw new Error(`got ${page.status}`)
        }
        if (page.headers.get('content-type') !== 'font/woff2') {
          throw new Error(`content-type ${page.headers.get('content-type')}`)
        }
        if (page.headers.get('cache-control') !== 'public, max-age=31536000, immutable, no-transform') {
          throw new Error(`cache-control ${page.headers.get('cache-control')}`)
        }
        if (page.headers.get('accept-ranges') !== 'bytes' || page.headers.get('x-content-type-options') !== 'nosniff') {
          throw new Error('media header profile incomplete')
        }
        const body = await page.text()
        if (body !== SMOKE_FONT_BYTES) {
          throw new Error(`body drifted: ${JSON.stringify(body)}`)
        }
        const range = await fetch(`${sayakaOrigin}${path}`, {
          headers: { range: 'bytes=0-4' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (
          range.status !== 206 ||
          range.headers.get('content-range') !== `bytes 0-4/${SMOKE_FONT_BYTES.length}` ||
          (await range.text()) !== 'woff2'
        ) {
          throw new Error(`range answered ${range.status} range=${range.headers.get('content-range')}`)
        }
        const etag = page.headers.get('etag')
        const conditional = await fetch(`${sayakaOrigin}${path}`, {
          headers: { 'if-none-match': etag ?? '' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (conditional.status !== 304) {
          throw new Error(`conditional font answered ${conditional.status}`)
        }
        const unsatisfiable = await fetch(`${sayakaOrigin}${path}`, {
          headers: { range: 'bytes=99999-' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (
          unsatisfiable.status !== 416 ||
          unsatisfiable.headers.get('content-range') !== `bytes */${SMOKE_FONT_BYTES.length}`
        ) {
          throw new Error(`unsatisfiable range answered ${unsatisfiable.status}`)
        }
        const malformed = await fetchManual(`${sayakaOrigin}/fonts/embedded/abc123/result.css`)
        if (malformed.status !== 400) {
          throw new Error(`malformed font key answered ${malformed.status}`)
        }
        const missing = await fetchManual(`${sayakaOrigin}/fonts/embedded/${'b'.repeat(64)}/result.css`)
        if (missing.status !== 404) {
          throw new Error(`missing font package answered ${missing.status}`)
        }
        return `200 immutable stream, 206 slice, 304, 416 bytes */${SMOKE_FONT_BYTES.length}, 400 malformed, 404 missing`
      },
    )
    await check('storage object through sayaka streams with ranges and keeps the namespace allowlist', async () => {
      const path = '/storage/images/split-smoke.jpg'
      const page = await fetchManual(`${sayakaOrigin}${path}`)
      if (page.status !== 200) {
        throw new Error(`got ${page.status}`)
      }
      if (page.headers.get('content-type') !== 'image/jpeg') {
        throw new Error(`content-type ${page.headers.get('content-type')}`)
      }
      const body = await page.text()
      if (body !== SMOKE_STORAGE_BYTES) {
        throw new Error(`body drifted: ${JSON.stringify(body)}`)
      }
      const range = await fetch(`${sayakaOrigin}${path}`, {
        headers: { range: 'bytes=4-19' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      const rangeText = await range.text()
      if (range.status !== 206 || rangeText !== 'quick brown fox ') {
        throw new Error(`range answered ${range.status} body=${JSON.stringify(rangeText)}`)
      }
      const etag = page.headers.get('etag')
      const conditional = await fetch(`${sayakaOrigin}${path}`, {
        headers: { 'if-none-match': etag ?? '' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (conditional.status !== 304) {
        throw new Error(`conditional storage answered ${conditional.status}`)
      }
      const private_ = await fetchManual(`${sayakaOrigin}/storage/backup/secret.gz`)
      if (private_.status !== 404) {
        throw new Error(`private namespace answered ${private_.status}`)
      }
      const missing = await fetchManual(`${sayakaOrigin}/storage/images/absent.jpg`)
      if (missing.status !== 404) {
        throw new Error(`missing object answered ${missing.status}`)
      }
      return '200 immutable stream, 206 slice, 304, private namespace 404, missing object 404'
    })
    await check(
      'a compressible ≥1 KiB storage svg through sayaka arrives uncompressed with a strong ETag and 304 revalidation',
      async () => {
        const path = '/storage/branding/smoke-logo.svg'
        const page = await fetchManual(`${sayakaOrigin}${path}`)
        if (page.status !== 200) {
          throw new Error(`got ${page.status}`)
        }
        if (page.headers.get('content-encoding') !== null) {
          throw new Error(`Content-Encoding ${page.headers.get('content-encoding')}`)
        }
        if (page.headers.get('content-type') !== 'image/svg+xml') {
          throw new Error(`content-type ${page.headers.get('content-type')}`)
        }
        const etag = page.headers.get('etag')
        if (etag === null || etag.startsWith('W/') || !etag.startsWith('"') || !etag.endsWith('"')) {
          throw new Error(`etag ${etag ?? '(none)'} is not strong quoted`)
        }
        const body = await page.text()
        if (body !== SMOKE_SVG_BODY) {
          throw new Error('body drifted from the seeded svg bytes')
        }
        const conditional = await fetch(`${sayakaOrigin}${path}`, {
          headers: { 'if-none-match': etag },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        })
        if (conditional.status !== 304) {
          throw new Error(`conditional svg answered ${conditional.status}`)
        }
        return `200 uncompressed, strong ${etag}, byte-identical, 304 on revalidation`
      },
    )
    await check(
      'public resources answered through sayaka carry no Set-Cookie while the home document still mints __csrf',
      async () => {
        for (const path of [
          '/feed',
          '/sitemap.xml',
          '/robots.txt',
          '/manifest.webmanifest',
          '/favicon.svg',
          '/images/open-graph.png',
          '/images/calendar/2026/0617.png',
          '/images/avatar/abcdef0123456789.png',
          '/fonts/embedded/' + SMOKE_FONT_HASH + '/chunk-001.woff2',
          '/storage/images/split-smoke.jpg',
        ]) {
          const res = await fetchManual(`${sayakaOrigin}${path}`)
          if (![200, 302].includes(res.status)) {
            throw new Error(`${path} answered ${res.status}`)
          }
          if (res.headers.getSetCookie().length > 0) {
            throw new Error(`${path} carried Set-Cookie: ${res.headers.getSetCookie().join('; ')}`)
          }
        }
        const home = await fetchManual(`${sayakaOrigin}/`)
        if (home.status !== 200) {
          throw new Error(`home document answered ${home.status}`)
        }
        if (!home.headers.getSetCookie().some((cookie) => cookie.startsWith('__csrf='))) {
          throw new Error('home document no longer relays the anonymous __csrf cookie')
        }
        return '4 resources cookie-free, home document still relays __csrf'
      },
    )
    await check('bootstrap RPC through sayaka matches kobato direct', async () => {
      const viaSayaka = await postRpc(sayakaOrigin, '/public/content/bootstrap')
      const direct = await postRpc(kobatoOrigin, '/public/content/bootstrap')
      if (viaSayaka.status !== 200 || direct.status !== 200) {
        throw new Error(`sayaka ${viaSayaka.status}, kobato ${direct.status}`)
      }
      const left: unknown = stripCsrfTokens(await viaSayaka.json())
      const right: unknown = stripCsrfTokens(await direct.json())
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        throw new Error('bootstrap payloads differ beyond the volatile csrfToken')
      }
      return 'payloads equal after csrfToken normalisation'
    })

    const promotedJar = createCookieJar()
    const promotedSend = async (path: string, headers: Record<string, string>, input: unknown): Promise<Response> => {
      const full: Record<string, string> = { 'content-type': 'application/json', ...headers }
      const cookie = promotedJar.header()
      if (cookie !== undefined) {
        full.cookie = cookie
      }
      const res = await fetch(`${sayakaOrigin}/rpc${path}`, {
        method: 'POST',
        headers: full,
        body: JSON.stringify({ json: input }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      promotedJar.store(res)
      return res
    }
    let promotedCsrf: string | null = null
    let promotedCommentKey: string | null = null
    await check('promoted interaction procedures: seeded-post comment key resolves through sayaka', async () => {
      if (seededPost === null) {
        throw new Error('skipped: post seeding failed')
      }
      const boot = await promotedSend('/public/content/bootstrap', {}, {})
      const bootEnvelope: unknown = await boot.json()
      promotedCsrf =
        isRecord(bootEnvelope) && isRecord(bootEnvelope.json) && typeof bootEnvelope.json.csrfToken === 'string'
          ? bootEnvelope.json.csrfToken
          : null
      if (promotedCsrf === null) {
        throw new Error('bootstrap carried no csrfToken')
      }
      const detail = await promotedSend('/public/content/posts/bySlug', {}, { slug: seededPost.slug })
      const detailEnvelope: unknown = await detail.json()
      const payload =
        isRecord(detailEnvelope) && isRecord(detailEnvelope.json) && isRecord(detailEnvelope.json.payload)
          ? detailEnvelope.json.payload
          : null
      const critical = payload !== null && isRecord(payload.critical) ? payload.critical : null
      promotedCommentKey = critical !== null && typeof critical.commentKey === 'string' ? critical.commentKey : null
      if (promotedCommentKey === null) {
        throw new Error('post detail carried no critical.commentKey')
      }
      return `comment key ${promotedCommentKey}`
    })
    await check(
      'promoted /rpc/public/likes/increase through sayaka: 403 without CSRF, liked with the token',
      async () => {
        if (promotedCsrf === null || promotedCommentKey === null) {
          throw new Error('skipped: no csrf token or comment key')
        }
        const anonymous = await promotedSend('/public/likes/increase', {}, { key: promotedCommentKey })
        if (anonymous.status !== 403) {
          throw new Error(`without a CSRF token got ${anonymous.status}, expected 403`)
        }
        const liked = await promotedSend(
          '/public/likes/increase',
          { 'x-csrf-token': promotedCsrf },
          { key: promotedCommentKey },
        )
        const likedEnvelope: unknown = await liked.json()
        const likedAnswer = isRecord(likedEnvelope) && isRecord(likedEnvelope.json) ? likedEnvelope.json : null
        if (
          liked.status !== 200 ||
          likedAnswer === null ||
          likedAnswer.key !== promotedCommentKey ||
          typeof likedAnswer.likes !== 'number' ||
          likedAnswer.likes < 1 ||
          typeof likedAnswer.token !== 'string'
        ) {
          throw new Error(`with the token got ${liked.status}, expected the liked answer with a fresh token`)
        }
        const validated = await promotedSend(
          '/public/likes/validate',
          { 'x-csrf-token': promotedCsrf },
          { key: promotedCommentKey, token: likedAnswer.token },
        )
        const validatedEnvelope: unknown = await validated.json()
        const validAnswer =
          isRecord(validatedEnvelope) && isRecord(validatedEnvelope.json) ? validatedEnvelope.json : null
        if (validated.status !== 200 || validAnswer === null || validAnswer.valid !== true) {
          throw new Error(`likes.validate with the fresh token got ${validated.status}`)
        }
        return `403 without CSRF, 200 liked (${likedAnswer.likes}), token validates`
      },
    )
    await check(
      'the pre-promotion /rpc/account/likes/increase no longer matches through sayaka (404 behind a valid token)',
      async () => {
        if (promotedCsrf === null || promotedCommentKey === null) {
          throw new Error('skipped: no csrf token or comment key')
        }
        const stale = await promotedSend(
          '/account/likes/increase',
          { 'x-csrf-token': promotedCsrf },
          { key: promotedCommentKey },
        )
        if (stale.status !== 404) {
          throw new Error(`got ${stale.status}, expected 404 for the retired account URL`)
        }
        return '404 behind a valid CSRF token'
      },
    )
    await check(
      'promoted /rpc/public/notifications/unreadCount through sayaka answers the same viewer-session 401 without a session',
      async () => {
        if (promotedCsrf === null) {
          throw new Error('skipped: no csrf token')
        }
        const unauthorized = await promotedSend(
          '/public/notifications/unreadCount',
          { 'x-csrf-token': promotedCsrf },
          {},
        )
        if (unauthorized.status !== 401) {
          throw new Error(`got ${unauthorized.status}, expected 401 for an anonymous viewer`)
        }
        return '401 behind a valid CSRF token and no session'
      },
    )
    await check(
      'forwarded /admin/signin: one CSP bound to its own script nonces, unique Link entries, entry chunk reachable',
      async () => {
        const res = await fetchManual(`${sayakaOrigin}/admin/signin`)
        if (res.status !== 200) {
          throw new Error(`got ${res.status}`)
        }
        const body = await res.text()
        const csp = res.headers.get('content-security-policy')
        if (csp === null) {
          throw new Error('no content-security-policy header')
        }
        if ((csp.match(/default-src/g) ?? []).length !== 1) {
          throw new Error(`expected exactly one CSP policy, got: ${csp}`)
        }
        const headerNonce = /'nonce-([^']+)'/.exec(csp)?.[1]
        const scriptNonces = [...body.matchAll(/<script[^>]*\snonce="([^"]+)"/g)].map((match) => match[1])
        if (headerNonce === undefined || scriptNonces.length === 0) {
          throw new Error('no CSP nonce or no nonce-bearing <script> tag in the document')
        }
        if (!scriptNonces.every((nonce) => nonce === headerNonce)) {
          throw new Error(`script nonces ${scriptNonces.join(',')} do not match CSP nonce ${headerNonce}`)
        }
        const link = res.headers.get('link')
        if (link !== null) {
          const entries = link.split(',').map((entry) => entry.trim())
          if (new Set(entries).size !== entries.length) {
            throw new Error(`duplicated Link header entries: ${link}`)
          }
        }
        const entryChunks = [
          ...new Set(
            [...body.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]*entry\.client[^"]*)"/g)].map((m) => m[1]!),
          ),
        ]
        if (entryChunks.length === 0) {
          throw new Error('no entry.client chunk referenced by the signin document')
        }
        for (const url of entryChunks) {
          const asset = await fetchManual(`${sayakaOrigin}${url}`)
          if (asset.status !== 200) {
            throw new Error(`${url} answered ${asset.status} through sayaka`)
          }
        }
        return `single CSP, nonce ${headerNonce}, ${entryChunks.length} entry chunk(s) 200 through sayaka`
      },
    )

    if (existsSync(HEADLESS_CHROME)) {
      await check('browser: kobato /admin/signin hydrates into the real login form', async () => {
        const dom = await dumpDom(kobatoOrigin, '/admin/signin', dirs.root)
        return assertHydratedSigninForm(dom, 'kobato origin')
      })
      await check('browser: sayaka-forwarded /admin/signin hydrates into the real login form', async () => {
        const dom = await dumpDom(sayakaOrigin, '/admin/signin', dirs.root)
        return assertHydratedSigninForm(dom, 'sayaka origin')
      })
      await check('browser: anonymous /admin/ through sayaka ends on the signin form', async () => {
        const dom = await dumpDom(sayakaOrigin, '/admin/', dirs.root)
        return assertHydratedSigninForm(dom, 'anonymous /admin/')
      })
    } else {
      console.log(`  SKIP  browser SPA hydration checks — no headless Chrome at ${HEADLESS_CHROME}`)
    }

    await stopServer(kobato)
    restrictResourceRateLimit(databases.database)
    disableWebmentionReceive(databases.database)
    kobato = await bootNode(
      kobatoCommand,
      kobatoBaseArgs,
      ['--config', configPath],
      {},
      dirs.cwd,
      kobatoPort,
      kobatoLog,
    )
    smokeState.kobato = kobato
    const restrictedHealth = await waitForHttp(`${kobatoOrigin}/health`, kobato.exitState)
    if (restrictedHealth.status !== 200) {
      throw new Error(`expected kobato /health 200 after rate-limit restart, got ${restrictedHealth.status}`)
    }

    await check(
      'resource rate limit keys on the visitor address sayaka forwards (untrusted-peer header spoofing is ignored, covered at unit level)',
      async () => {
        const first = await postRpc(sayakaOrigin, '/public/content/archives')
        if (first.status !== 200) {
          throw new Error(`first archives request got ${first.status}`)
        }
        const second = await postRpc(sayakaOrigin, '/public/content/archives')
        if (second.status !== 429) {
          throw new Error(`second archives request got ${second.status}, expected 429 (loopback bucket exhausted)`)
        }
        const proxied = await postRpc(sayakaOrigin, '/public/content/archives', { 'x-forwarded-for': '203.0.113.9' })
        if (proxied.status !== 200) {
          throw new Error(`request with X-Forwarded-For 203.0.113.9 got ${proxied.status}, expected a fresh bucket`)
        }
        const proxiedAgain = await postRpc(sayakaOrigin, '/public/content/archives', {
          'x-forwarded-for': '203.0.113.9',
        })
        if (proxiedAgain.status !== 429) {
          throw new Error(`second 203.0.113.9 request got ${proxiedAgain.status}, expected 429 (own bucket)`)
        }
        const direct = await postRpc(kobatoOrigin, '/public/content/archives', { 'x-forwarded-for': '198.51.100.23' })
        if (direct.status !== 200) {
          throw new Error(`direct kobato request with X-Forwarded-For got ${direct.status}, expected a fresh bucket`)
        }
        return 'loopback bucket exhausted; 203.0.113.9 forwarded through sayaka gets and exhausts its own bucket'
      },
    )
    await check('POST /webmention through sayaka answers the captured 410 once receiving is disabled', async () => {
      const res = await fetch(`${sayakaOrigin}/webmention`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          source: 'https://sender.example/blog/mentioning',
          target: 'http://127.0.0.1/x',
        }).toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status !== 410 || (await res.text()) !== DISABLED_WEBMENTION_BODY) {
        throw new Error(`disabled receive answered ${res.status}`)
      }
      return '410 Gone, byte-identical body'
    })
  } catch (error) {
    keepTemp = true
    results.push({ name: 'boot', ok: false, detail: error instanceof Error ? error.message : String(error) })
    console.log(`  FAIL  boot — ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (sayaka !== null) {
      await stopServer(sayaka).catch(() => undefined)
    }
    if (kobato !== null) {
      await stopServer(kobato).catch(() => undefined)
    }
    if (!keepTemp && results.every((result) => result.ok)) {
      await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
    } else {
      console.log(`    temp dir kept for inspection: ${dirs.root}`)
    }
  }

  const failed = results.filter((result) => !result.ok)
  console.log(`\nsplit smoke: ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.log(`    logs: ${kobatoLog} / ${sayakaLog}`)
    process.exitCode = 1
  }
}

await main()
