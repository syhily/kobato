import { bootSuiteInstance, stopSuiteInstance } from '@kobato/pack/instance/suite-instance'
import { fail } from '@kobato/pack/sea/exec'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve as resolvePath } from 'node:path'

const USAGE = 'Usage: node tools/pack/src/sea/browser.ts [--managed] [path-to-binary]'
const PLAYWRIGHT_CONFIG = resolvePath(import.meta.dirname, '..', '..', 'playwright.config.ts')

function uniquePostSlug() {
  return `browser-journey-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

function runPlaywright(extraEnv: Record<string, string>) {
  const args = ['--filter', '@kobato/pack', 'exec', 'playwright', 'test', '--config', PLAYWRIGHT_CONFIG]
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

async function runManaged(binaryPath: string) {
  console.log('==> SEA browser journeys (managed boot + Playwright)')
  const instance = await bootSuiteInstance(binaryPath, { adminEmail: 'browser-admin@kobato.local', log: console.log })
  try {
    return runPlaywright({
      KOBATO_BROWSER_BASE_URL: instance.baseUrl,
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
  return runManaged(binaryArg === undefined ? seaBinaryPath() : resolvePath(repoRoot, binaryArg))
}

const status = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

console.log(status === 0 ? '==> SEA browser: passed' : `==> SEA browser: failed (Playwright exit ${status})`)
process.exit(status)
