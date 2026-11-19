import type { SmokeServer } from '@kobato/harness/sea-instance.ts'

import { bootServer, ensureBinaryExists, waitForExit, waitForHttp } from '@kobato/harness/sea-instance.ts'
import { relaxRateLimits, seedInstalledInstance } from '@kobato/harness/seed.ts'
import { makeTempDirs, smokeDatabases } from '@kobato/harness/temp.ts'
import { fail } from '@kobato/pack/sea/exec.ts'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths.ts'
import bcrypt from 'bcryptjs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

const SHUTDOWN_TIMEOUT_MS = 15_000

export interface BrowserSuiteOptions {
  /** Built SEA binary (managed mode only). Defaults to `dist-sea/kobato`. */
  binaryPath?: string
  /** Boot the SEA binary even when KOBATO_BROWSER_BASE_URL is set (`sea:browser`). */
  forceBoot?: boolean
}

function uniquePostSlug() {
  return `browser-journey-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

function runPlaywright(extraEnv: Record<string, string>) {
  // Run Playwright through the package that owns it, so its config and the
  // CLI resolve from tools/browser/node_modules instead of the workspace root.
  const configPath = resolvePath(import.meta.dirname, '../playwright.config.ts')
  const args = ['--filter', '@kobato/browser', 'exec', 'playwright', 'test', '--config', configPath]
  const grep = process.env.KOBATO_BROWSER_TEST_GREP
  if (grep !== undefined && grep !== '') {
    args.push('--grep', grep)
  }
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    // pnpm is a .cmd shim on Windows.
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      KOBATO_BROWSER_POST_SLUG: uniquePostSlug(),
      ...extraEnv,
    },
  })
  if (result.error) {
    throw new Error(`Failed to spawn Playwright: ${result.error.message}`)
  }
  return result.status ?? 1
}

function runExternal(baseUrl: string) {
  const { KOBATO_BROWSER_ADMIN_EMAIL, KOBATO_BROWSER_ADMIN_PASSWORD } = process.env
  if (!KOBATO_BROWSER_ADMIN_EMAIL || !KOBATO_BROWSER_ADMIN_PASSWORD) {
    fail(
      'KOBATO_BROWSER_BASE_URL is set but KOBATO_BROWSER_ADMIN_EMAIL / KOBATO_BROWSER_ADMIN_PASSWORD are missing. ' +
        'The journeys sign in and stage one post through the admin HTTP surface.',
    )
  }
  console.log(`==> browser journeys (external instance ${baseUrl})`)
  console.warn(
    '    the global setup stages one post and resets the general settings baseline on THIS instance — never point this at production',
  )
  return runPlaywright({ KOBATO_BROWSER_BASE_URL: baseUrl })
}

export async function runBrowserSuite(options: BrowserSuiteOptions = {}): Promise<number> {
  const externalBaseUrl = process.env.KOBATO_BROWSER_BASE_URL
  if (!options.forceBoot && externalBaseUrl !== undefined) {
    return runExternal(externalBaseUrl.replace(/\/+$/, ''))
  }

  const binaryPath = options.binaryPath ? resolvePath(repoRoot, options.binaryPath) : seaBinaryPath()
  await ensureBinaryExists(binaryPath)

  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  const serverLogPath = join(dirs.root, 'server.log')

  console.log('==> SEA browser journeys (managed boot + Playwright)')
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

  let status = 1
  let server: SmokeServer | null = null
  try {
    server = await bootServer(binaryPath, dirs, env, serverLogPath)
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
    const fresh = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (fresh.status !== 303) {
      throw new Error(`expected /health 303 → /admin/setup on a fresh instance, got ${fresh.status}`)
    }
    server.child.kill('SIGTERM')
    await waitForExit(server, SHUTDOWN_TIMEOUT_MS)

    const adminEmail = 'browser-admin@kobato.local'
    const adminPassword = randomBytes(12).toString('hex')
    await seedInstalledInstance(databases.database, {
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })
    relaxRateLimits(databases.database)

    server = await bootServer(binaryPath, dirs, env, serverLogPath)
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (seeded restart)`)
    const health = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (health.status !== 200) {
      throw new Error(`expected /health 200 on the seeded instance, got ${health.status}`)
    }

    status = runPlaywright({
      KOBATO_BROWSER_BASE_URL: `http://127.0.0.1:${server.port}`,
      KOBATO_BROWSER_ADMIN_EMAIL: adminEmail,
      KOBATO_BROWSER_ADMIN_PASSWORD: adminPassword,
    })
  } finally {
    if (server !== null && !server.exitState.exited) {
      server.child.kill('SIGTERM')
      await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
    }
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }

  return status
}
