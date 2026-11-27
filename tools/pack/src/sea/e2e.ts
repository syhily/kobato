import { fail } from '@kobato/instance/process'
import { readConvergedConfig } from '@kobato/instance/seed'
import { bootSuiteInstance, stopSuiteInstance } from '@kobato/instance/suite-instance'
import { repoRoot, seaBinaryPath, sayakaBinarySiblingPath } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'
import { join, resolve as resolvePath } from 'node:path'

interface SuiteResult {
  label: string
  status: number
}

function runVitest(configPath: string, env: Record<string, string>, label: string): SuiteResult {
  console.log(`==> vitest run (${label})`)
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', configPath], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      KOBATO_E2E_BASE_URL: env.baseUrl,
      KOBATO_E2E_PUBLIC_URL: env.publicBaseUrl,
      KOBATO_E2E_ADMIN_EMAIL: env.adminEmail,
      KOBATO_E2E_ADMIN_PASSWORD: env.adminPassword,
      KOBATO_E2E_DATABASE: env.database,
    },
  })
  if (result.error) {
    throw new Error(`Failed to spawn vitest: ${result.error.message}`)
  }
  return { label, status: result.status ?? 1 }
}

async function main() {
  const binaryArg = process.argv[2]
  if (binaryArg?.startsWith('--')) {
    fail('Usage: node tools/pack/src/sea/e2e.ts [path-to-kobato-binary]')
  }
  const kobatoBinaryPath = binaryArg === undefined ? seaBinaryPath('kobato') : resolvePath(repoRoot, binaryArg)
  const sayakaBinaryPath = binaryArg === undefined ? seaBinaryPath('sayaka') : sayakaBinarySiblingPath(kobatoBinaryPath)

  console.log('==> SEA e2e (managed pair + tests/e2e)')
  const instance = await bootSuiteInstance(kobatoBinaryPath, sayakaBinaryPath, {
    adminEmail: 'e2e-admin@kobato.local',
    log: console.log,
  })
  const results: SuiteResult[] = []
  try {
    const converged = await readConvergedConfig(join(instance.dirs.root, 'kobato.config.json'))
    if (converged.database !== instance.databases.database) {
      throw new Error(
        `config file did not converge: storage.database is ${converged.database}, expected ${instance.databases.database}`,
      )
    }
    console.log('    config file converged (env written back)')

    const env = {
      baseUrl: instance.baseUrl,
      publicBaseUrl: instance.publicBaseUrl,
      adminEmail: instance.adminEmail,
      adminPassword: instance.adminPassword,
      database: instance.databases.database,
    }
    results.push(runVitest('apps/kobato/tests/e2e/vitest.config.ts', env, 'tests/e2e (kobato)'))
    results.push(runVitest('apps/sayaka/tests/e2e/vitest.config.ts', env, 'tests/e2e (sayaka public)'))
  } finally {
    await stopSuiteInstance(instance)
  }

  const failed = results.filter((result) => result.status !== 0)
  if (failed.length === 0) {
    console.log('==> SEA e2e: passed')
  } else {
    console.log(`==> SEA e2e: failed (${failed.map((result) => `${result.label} exit ${result.status}`).join(', ')})`)
  }
  process.exit(failed.length === 0 ? 0 : 1)
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
