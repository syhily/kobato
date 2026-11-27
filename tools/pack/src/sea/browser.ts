import { repoRoot, seaBinaryPath, sayakaBinarySiblingPath } from '@kobato/pack/sea/paths'
import { bootSuiteInstance, stopSuiteInstance } from '@kobato/test/instance/suite-instance'
import { fail } from '@kobato/test/process'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join, resolve as resolvePath } from 'node:path'

const USAGE = 'Usage: node tools/pack/src/sea/browser.ts [--managed] [path-to-kobato-binary]'
const PLAYWRIGHT_CONFIG = join(repoRoot, 'tools', 'test', 'playwright.config.ts')
const PLAYWRIGHT_PACKAGE = '@kobato/test'

function uniquePostSlug() {
  return `browser-journey-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

function runPlaywright(extraEnv: Record<string, string>) {
  const args = ['--filter', PLAYWRIGHT_PACKAGE, 'exec', 'playwright', 'test', '--config', PLAYWRIGHT_CONFIG]
  const grep = process.env.KOBATO_BROWSER_TEST_GREP
  if (grep !== undefined && grep !== '') {
    args.push('--grep', grep)
  }
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
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

function runExternal(publicBaseUrl: string) {
  const { KOBATO_BROWSER_ADMIN_EMAIL, KOBATO_BROWSER_ADMIN_PASSWORD } = process.env
  if (!KOBATO_BROWSER_ADMIN_EMAIL || !KOBATO_BROWSER_ADMIN_PASSWORD) {
    fail(
      'KOBATO_BROWSER_BASE_URL is set but KOBATO_BROWSER_ADMIN_EMAIL / KOBATO_BROWSER_ADMIN_PASSWORD are missing. ' +
        'Point KOBATO_BROWSER_BASE_URL at the sayaka origin — the journeys sign in and stage one post through the forwarded admin surface.',
    )
  }
  console.log(`==> browser journeys (external instance ${publicBaseUrl})`)
  console.warn(
    '    the global setup stages one post and resets the general settings baseline on THIS instance — never point this at production',
  )
  return runPlaywright({ KOBATO_BROWSER_BASE_URL: publicBaseUrl })
}

async function runManaged(kobatoBinaryPath: string, sayakaBinaryPath: string) {
  console.log('==> SEA browser journeys (managed pair boot + Playwright)')
  const instance = await bootSuiteInstance(kobatoBinaryPath, sayakaBinaryPath, {
    adminEmail: 'browser-admin@kobato.local',
    log: console.log,
  })
  try {
    return runPlaywright({
      KOBATO_BROWSER_BASE_URL: instance.publicBaseUrl,
      KOBATO_BROWSER_ADMIN_EMAIL: instance.adminEmail,
      KOBATO_BROWSER_ADMIN_PASSWORD: instance.adminPassword,
    })
  } finally {
    await stopSuiteInstance(instance)
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const managed = args.includes('--managed')
  const binaryArg = args.find((arg) => arg !== '--managed')
  if (binaryArg?.startsWith('--')) {
    fail(USAGE)
  }

  const externalBaseUrl = process.env.KOBATO_BROWSER_BASE_URL
  if (!managed && externalBaseUrl !== undefined) {
    return runExternal(externalBaseUrl.replace(/\/+$/, ''))
  }
  const kobatoBinaryPath = binaryArg === undefined ? seaBinaryPath('kobato') : resolvePath(repoRoot, binaryArg)
  const sayakaBinaryPath = binaryArg === undefined ? seaBinaryPath('sayaka') : sayakaBinarySiblingPath(kobatoBinaryPath)
  return runManaged(kobatoBinaryPath, sayakaBinaryPath)
}

const status = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

console.log(status === 0 ? '==> SEA browser: passed' : `==> SEA browser: failed (Playwright exit ${status})`)
process.exit(status)
