import { readConvergedConfig } from '@kobato/pack/instance/seed'
import { bootSuiteInstance, stopSuiteInstance } from '@kobato/pack/instance/suite-instance'
import { fail } from '@kobato/pack/process'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'
import { join, resolve as resolvePath } from 'node:path'

async function main() {
  const binaryArg = process.argv[2]
  if (binaryArg?.startsWith('--')) {
    fail('Usage: node tools/pack/src/sea/e2e.ts [path-to-binary]')
  }
  const binaryPath = binaryArg === undefined ? seaBinaryPath() : resolvePath(repoRoot, binaryArg)

  console.log('==> SEA e2e (managed boot + tests/e2e)')
  const instance = await bootSuiteInstance(binaryPath, { adminEmail: 'e2e-admin@kobato.local', log: console.log })
  let vitestStatus: number | null = null
  try {
    const converged = await readConvergedConfig(join(instance.dirs.root, 'kobato.config.json'))
    if (converged.database !== instance.databases.database) {
      throw new Error(
        `config file did not converge: storage.database is ${converged.database}, expected ${instance.databases.database}`,
      )
    }
    console.log('    config file converged (env written back)')

    console.log('==> vitest run (tests/e2e)')
    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'apps/kobato/tests/e2e/vitest.config.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        KOBATO_E2E_BASE_URL: instance.baseUrl,
        KOBATO_E2E_ADMIN_EMAIL: instance.adminEmail,
        KOBATO_E2E_ADMIN_PASSWORD: instance.adminPassword,
        KOBATO_E2E_DATABASE: instance.databases.database,
      },
    })
    if (result.error) {
      throw new Error(`Failed to spawn vitest: ${result.error.message}`)
    }
    vitestStatus = result.status ?? 1
  } finally {
    await stopSuiteInstance(instance)
  }

  console.log(vitestStatus === 0 ? '==> SEA e2e: passed' : `==> SEA e2e: failed (vitest exit ${vitestStatus})`)
  process.exit(vitestStatus)
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
