// HTTP e2e orchestrator (`pnpm run sea:e2e [binary]`).
//
// Boots the built SEA binary against a fresh per-run database — the same
// shared lifecycle as the managed smoke (scripts/sea/instance.ts) — but
// seeds the admin with a KNOWN random password, then runs the tests/e2e
// vitest project against the live server over real HTTP. The vitest exit
// code becomes this script's exit code; the server, the per-run database,
// and the temp dirs are always cleaned up.
//
// DATABASE_URL / REDIS_URL default to the docker-compose.test.yml stack,
// exactly like the smoke. The e2e tests themselves are HTTP-only — they
// receive the base URL and the admin credentials through the KOBATO_E2E_*
// env vars and never touch the database directly.

import bcrypt from 'bcryptjs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

import { fail } from './exec.ts'
import {
  bootServer,
  createSmokeDatabase,
  DEFAULT_DATABASE_URL,
  DEFAULT_REDIS_URL,
  describeUrl,
  dropSmokeDatabase,
  ensureBinaryExists,
  makeTempDirs,
  readConvergedConfig,
  seedInstalledInstance,
  waitForExit,
  waitForHttp,
} from './instance.ts'
import { repoRoot, seaBinaryPath } from './paths.ts'

const SHUTDOWN_TIMEOUT_MS = 15_000

async function main() {
  const binaryPath = process.argv[2] ? resolvePath(process.argv[2]) : seaBinaryPath()
  if (process.argv[2]?.startsWith('--')) {
    fail('Usage: node scripts/sea/e2e.ts [path-to-binary]')
  }
  await ensureBinaryExists(binaryPath)

  const databaseUrl = process.env.database__url ?? DEFAULT_DATABASE_URL
  const redisUrl = process.env.redis__url ?? DEFAULT_REDIS_URL
  const dirs = await makeTempDirs()
  const serverLogPath = join(dirs.root, 'server.log')

  console.log('==> SEA e2e (managed boot + tests/e2e)')
  console.log(`    binary:   ${binaryPath}`)
  console.log(`    database: ${describeUrl(databaseUrl)}`)
  console.log(`    redis:    ${describeUrl(redisUrl)}`)
  console.log(`    temp dir: ${dirs.root}`)

  const database = await createSmokeDatabase(databaseUrl)
  console.log(`    per-run db: ${database.databaseName}`)

  const env = {
    database__url: database.smokeDatabaseUrl,
    redis__url: redisUrl,
    // Isolate all Redis keys (sessions, rate limits) from anything else
    // sharing this Redis instance — e.g. an it-suite worker mapped to the
    // same logical DB can leave an exceeded signin bucket behind.
    redis__keyPrefix: `e2e-${randomBytes(4).toString('hex')}:`,
    auth__sessionSecret: randomBytes(32).toString('hex'),
    security__encryptionKey: randomBytes(32).toString('hex'),
    paths__data: dirs.data,
    KOBATO_CACHE_DIR: dirs.cache,
    NODE_ENV: 'production',
  }

  let vitestStatus: number | null = null
  let server = await bootServer(binaryPath, dirs, env, serverLogPath)
  try {
    // First boot: applies the embedded migrations (the seed below needs
    // the tables) and proves the fresh-install gate answers the setup
    // redirect.
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
    const fresh = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (fresh.status !== 303) {
      fail(`expected /health 303 → /admin/setup on a fresh instance, got ${fresh.status}`)
    }
    server.child.kill('SIGTERM')
    await waitForExit(server, SHUTDOWN_TIMEOUT_MS)

    // Unlike the smoke (which never logs in and seeds a placeholder
    // hash), the e2e suite signs in over real HTTP — seed a bcrypt hash
    // of a per-run random password handed to the tests via env. The
    // settings snapshot only loads at boot, so the seeded instance needs
    // a restart (same as the smoke's seeded phase).
    const adminEmail = 'e2e-admin@kobato.local'
    const adminPassword = randomBytes(12).toString('hex')
    await seedInstalledInstance(database.smokeDatabaseUrl, {
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })

    server = await bootServer(binaryPath, dirs, env, serverLogPath)
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (seeded restart)`)
    const health = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (health.status !== 200) {
      fail(`expected /health 200 on the seeded instance, got ${health.status}`)
    }

    // The env-driven first boot must have written its overrides back into
    // the config file — assert the instance is self-contained.
    const converged = await readConvergedConfig(join(dirs.root, 'kobato.config.json'))
    if (converged.databaseUrl !== database.smokeDatabaseUrl) {
      fail(
        `config file did not converge: database.url is ${converged.databaseUrl}, expected ${database.smokeDatabaseUrl}`,
      )
    }
    console.log('    config file converged (env written back)')

    console.log('==> vitest run (tests/e2e)')
    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'tests/e2e/vitest.config.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
      // pnpm is a .cmd shim on Windows — see exec.ts.
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        KOBATO_E2E_BASE_URL: `http://127.0.0.1:${server.port}`,
        KOBATO_E2E_ADMIN_EMAIL: adminEmail,
        KOBATO_E2E_ADMIN_PASSWORD: adminPassword,
      },
    })
    if (result.error) {
      fail(`Failed to spawn vitest: ${result.error.message}`)
    }
    vitestStatus = result.status ?? 1
  } finally {
    if (!server.exitState.exited) {
      server.child.kill('SIGTERM')
      await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
    }
    await dropSmokeDatabase(databaseUrl, database.databaseName).catch((error: unknown) => {
      console.warn(
        `Warning: failed to drop ${database.databaseName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
    await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
  }

  console.log(vitestStatus === 0 ? '==> SEA e2e: passed' : `==> SEA e2e: failed (vitest exit ${vitestStatus})`)
  process.exit(vitestStatus)
}

await main()
