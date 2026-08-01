// HTTP e2e orchestrator (`pnpm run sea:e2e [binary]`).
//
// Boots the built SEA binary against per-run temp files (SQLite content
// DB + DuckDB sidecar under one mkdtemp root — no external services) —
// the same shared lifecycle as the managed smoke
// (scripts/sea/instance.ts) — but seeds the admin with a KNOWN random
// password, then runs the tests/e2e vitest project against the live
// server over real HTTP. The vitest exit code becomes this script's exit
// code; the server and the temp dirs are always cleaned up.
//
// The e2e tests themselves are HTTP-only — they receive the base URL and
// the admin credentials through the KOBATO_E2E_* env vars and never
// touch the database directly.

import bcrypt from 'bcryptjs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { SmokeServer } from './instance.ts'

// The one src import: the canonical bucket table, so the relaxed
// blog.rateLimit row below can never drift out of the section schema.
import { rateLimitDefaults } from '../../src/shared/config/defaults.ts'
import { fail } from './exec.ts'
import {
  bootServer,
  ensureBinaryExists,
  makeTempDirs,
  readConvergedConfig,
  seedInstalledInstance,
  smokeDatabases,
  waitForExit,
  waitForHttp,
} from './instance.ts'
import { repoRoot, seaBinaryPath } from './paths.ts'

const SHUTDOWN_TIMEOUT_MS = 15_000

/**
 * The journeys share one instance and one source IP (127.0.0.1), so the
 * shipped sign-in / OTP-send budgets — sized for a public deployment —
 * would trip mid-suite (a dozen credential logins against a 5-per-30min
 * bucket). Relax exactly those buckets in the seeded settings row; every
 * other bucket keeps its production default. The row carries the full
 * bucket table because hydration validates it against the section schema.
 *
 * `resourceIp` is relaxed for sheer suite pressure: the journeys render
 * dozens of feed/OG/avatar resource URLs from the single test IP inside
 * one 60-second window, and even legitimate per-route counting would ride
 * the shipped 60/min bucket ceiling mid-suite. 1000 is the section
 * schema's ceiling (`rateLimitBounds`).
 */
function relaxRateLimitsForE2e(databasePath: string) {
  const relaxed = {
    ...rateLimitDefaults,
    signInIp: { windowSeconds: 60 * 30, maxAttempts: 100 },
    signInEmail: { windowSeconds: 60 * 30, maxAttempts: 100 },
    otpSendIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
    otpSendEmail: { windowSeconds: 60 * 5, maxAttempts: 10 },
    resourceIp: { windowSeconds: 60, maxAttempts: 1000 },
  }
  const db = new DatabaseSync(databasePath)
  try {
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.rateLimit', ?, ?, NULL)
       ON CONFLICT ("scope") DO UPDATE SET "data" = excluded."data"`,
    ).run(JSON.stringify(relaxed), Date.now())
  } finally {
    db.close()
  }
}

async function main() {
  const binaryPath = process.argv[2] ? resolvePath(process.argv[2]) : seaBinaryPath()
  if (process.argv[2]?.startsWith('--')) {
    fail('Usage: node scripts/sea/e2e.ts [path-to-binary]')
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
  // Never fail() (process.exit) from here on: an immediate exit would skip
  // the finally below and leak the server process plus the mkdtemp root
  // holding the throwaway database and secrets. Throw instead — the
  // top-level catch prints the message and sets a non-zero exit code.
  let server: SmokeServer | null = null
  try {
    server = await bootServer(binaryPath, dirs, env, serverLogPath)
    // First boot: applies the embedded migrations (the seed below needs
    // the tables) and proves the fresh-install gate answers the setup
    // redirect.
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (log: ${serverLogPath})`)
    const fresh = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (fresh.status !== 303) {
      throw new Error(`expected /health 303 → /admin/setup on a fresh instance, got ${fresh.status}`)
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
    await seedInstalledInstance(databases.database, {
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })
    relaxRateLimitsForE2e(databases.database)

    server = await bootServer(binaryPath, dirs, env, serverLogPath)
    console.log(`    waiting for http://127.0.0.1:${server.port}/health (seeded restart)`)
    const health = await waitForHttp(`http://127.0.0.1:${server.port}/health`, server.exitState)
    if (health.status !== 200) {
      throw new Error(`expected /health 200 on the seeded instance, got ${health.status}`)
    }

    // The env-driven first boot must have written its overrides back into
    // the config file — assert the instance is self-contained.
    const converged = await readConvergedConfig(join(dirs.root, 'kobato.config.json'))
    if (converged.database !== databases.database) {
      throw new Error(
        `config file did not converge: storage.database is ${converged.database}, expected ${databases.database}`,
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
        // Sanctioned seam for flows no admin RPC can stage (the magic-link
        // journey flips user.login_method directly). The file is the
        // throwaway per-run database — never a real deployment's.
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
  // A thrown failure already ran main's finally (server stopped, mkdtemp
  // root removed) — report it plainly and exit non-zero.
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
