import type { SmokeServer } from '@kobato/harness/sea-instance'

import { scanAccessEvents } from '@kobato/harness/analytics'
import { fetchManual, scrubbedParentEnv, sleep } from '@kobato/harness/process'
import { bootServer, ensureBinaryExists, waitForExit, waitForHttp } from '@kobato/harness/sea-instance'
import { readConvergedConfig, seedInstalledInstance } from '@kobato/harness/seed'
import { makeTempDirs, smokeDatabases } from '@kobato/harness/temp'
import { BINARY_MAX_BYTES } from '@kobato/pack/sea/budget'
import { fail } from '@kobato/pack/sea/exec'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

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

async function check(name: string, fn: () => string | undefined | Promise<string | undefined>) {
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

const NATIVES_FILE_COUNT = process.platform === 'win32' ? 8 : 6

function isExpectedNativeFile(name: string): boolean {
  return (
    name === 'sharp.node' ||
    name === 'skia.node' ||
    name === 'duckdb.node' ||
    name === 'font-split.node' ||
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
  if (
    !names.includes('sharp.node') ||
    !names.includes('skia.node') ||
    !names.includes('duckdb.node') ||
    !names.includes('font-split.node')
  ) {
    throw new Error(
      `sharp.node / skia.node / duckdb.node / font-split.node missing from the extraction: ${names.join(', ')}`,
    )
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

function checkVfs(binaryPath: string) {
  const expected = 'SEA VFS smoke passed:'
  const result = spawnSync(binaryPath, ['--smoke-vfs'], {
    encoding: 'utf-8',
    timeout: NATIVES_TIMEOUT_MS,
    env: scrubbedParentEnv(),
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
  return output.split('\n').find((line) => line.includes(expected)) ?? expected
}

function checkIntl(binaryPath: string) {
  const expected = 'SEA Intl smoke passed: en-US, zh-HK, zh-TW, zh-CN'
  const result = spawnSync(binaryPath, ['--smoke-intl'], {
    encoding: 'utf-8',
    timeout: VERSION_TIMEOUT_MS,
    env: scrubbedParentEnv(),
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
  const rendered = output.split('\n').filter((line) => line.trim().startsWith('zh-') || line.trim().startsWith('en-US'))
  return `${rendered.length} locale render lines + success`
}

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
    } catch {}
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
      const match = /(?:href|src)="(\/assets\/[^"]+?\.js)"/.exec(body)
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

async function runManaged(binaryPath: string) {
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
  }

  let server = null as SmokeServer | null
  try {
    await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath))
    await check('kobato --version', () => checkVersion(binaryPath))
    await check('kobato --smoke-vfs (mounted asset VFS)', () => checkVfs(binaryPath))
    await check('kobato --smoke-intl (four-locale ICU data)', () => checkIntl(binaryPath))
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

      const seeded =
        booted &&
        (await check('seed admin + core settings (SQL)', () =>
          seedInstalledInstance(databases.database, { email: SEED_ADMIN_EMAIL, passwordHash: SEED_ADMIN_PASSWORD }),
        ))
      if (seeded) {
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
          const BROWSER_UA =
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
          const PAGE_VIEWS = 3
          await check(`${PAGE_VIEWS} page views recorded over HTTP`, async () => {
            for (let i = 0; i < PAGE_VIEWS; i++) {
              const res = await fetch(`${baseUrl}/`, {
                headers: { 'user-agent': BROWSER_UA },
                redirect: 'manual',
                signal: AbortSignal.timeout(5_000),
              })
              if (res.status !== 200) {
                throw new Error(`page view ${i + 1}: expected 200, got ${res.status}`)
              }
            }
            await sleep(1_500)
            return `${PAGE_VIEWS} GET / with a browser UA`
          })
          await check('SIGTERM clean shutdown (seeded install)', () => checkShutdown(seededServer))
          await Promise.race([seededServer.logClosed, sleep(2_000)])
          await check('natives cache reused after restart', () => checkNativesReuse())
          await check('DuckDB analytics round-trip (page views → access_events)', async () => {
            const { rows, paths } = await scanAccessEvents(databases.analytics)
            if (rows < PAGE_VIEWS) {
              throw new Error(
                `expected ≥ ${PAGE_VIEWS} access_events rows after ${PAGE_VIEWS} page views, found ${rows}`,
              )
            }
            return `${rows} access_events rows, ${paths} distinct paths`
          })
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

async function runBinaryOnly(binaryPath: string) {
  await ensureBinaryExists(binaryPath)
  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)

  console.log(`    binary:   ${binaryPath}`)
  console.log(`    temp dir: ${dirs.root}`)

  await check('SEA binary within the compression budget', () => checkBinarySize(binaryPath))
  await check('kobato --version', () => checkVersion(binaryPath))
  await check('kobato --smoke-vfs (mounted asset VFS)', () => checkVfs(binaryPath))
  await check('kobato --smoke-intl (four-locale ICU data)', () => checkIntl(binaryPath))
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
      fail('Usage: node tools/pack/src/sea/smoke.ts --external <baseUrl>')
    }
    const baseUrl = normalizeBaseUrl(args[1])
    console.log(`==> SEA smoke (external: ${baseUrl})`)
    await runHttpChecks(baseUrl, null)
    await checkCalendar(baseUrl, { optional: true })
  } else if (args[0] === '--binary-only') {
    const binaryPath = args[1] ? resolvePath(repoRoot, args[1]) : seaBinaryPath()
    console.log('==> SEA smoke (binary-only)')
    cleanup = await runBinaryOnly(binaryPath)
  } else {
    if (args[0]?.startsWith('--')) {
      fail(
        'Usage: node tools/pack/src/sea/smoke.ts [--external <baseUrl> | --binary-only [path-to-binary] | path-to-binary]',
      )
    }
    const binaryPath = args[0] ? resolvePath(repoRoot, args[0]) : seaBinaryPath()
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
