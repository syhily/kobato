import type { SmokeServer } from '@kobato/harness/sea-instance'

import { bootServer, ensureBinaryExists, waitForExit, waitForHttp } from '@kobato/harness/sea-instance'
import { readConvergedConfig, relaxRateLimits, seedInstalledInstance } from '@kobato/harness/seed'
import { makeTempDirs, smokeDatabases } from '@kobato/harness/temp'
import { fail } from '@kobato/pack/sea/exec'
import { repoRoot, seaBinaryPath } from '@kobato/pack/sea/paths'
import bcrypt from 'bcryptjs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

const SHUTDOWN_TIMEOUT_MS = 15_000

async function main() {
  const binaryPath = process.argv[2] ? resolvePath(repoRoot, process.argv[2]) : seaBinaryPath()
  if (process.argv[2]?.startsWith('--')) {
    fail('Usage: node tools/pack/src/sea/e2e.ts [path-to-binary]')
  }
  await ensureBinaryExists(binaryPath)

  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  const serverLogPath = join(dirs.root, 'server.log')

  console.log('==> SEA e2e (managed boot + tests/e2e)')
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

  let vitestStatus: number | null = null
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

    const adminEmail = 'e2e-admin@kobato.local'
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

    const converged = await readConvergedConfig(join(dirs.root, 'kobato.config.json'))
    if (converged.database !== databases.database) {
      throw new Error(
        `config file did not converge: storage.database is ${converged.database}, expected ${databases.database}`,
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
        KOBATO_E2E_BASE_URL: `http://127.0.0.1:${server.port}`,
        KOBATO_E2E_ADMIN_EMAIL: adminEmail,
        KOBATO_E2E_ADMIN_PASSWORD: adminPassword,
        KOBATO_E2E_DATABASE: databases.database,
      },
    })
    if (result.error) {
      throw new Error(`Failed to spawn vitest: ${result.error.message}`)
    }
    vitestStatus = result.status ?? 1
  } finally {
    if (server !== null && !server.exitState.exited) {
      server.child.kill('SIGTERM')
      await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
    }
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }

  console.log(vitestStatus === 0 ? '==> SEA e2e: passed' : `==> SEA e2e: failed (vitest exit ${vitestStatus})`)
  process.exit(vitestStatus)
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
