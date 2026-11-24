import type { SmokeServer } from '@kobato/pack/instance/sea-instance'
import type { SmokeDatabases, TempDirs } from '@kobato/pack/instance/temp'

import {
  bootServer,
  ensureBinaryExists,
  seaInstanceEnv,
  waitForExit,
  waitForHttp,
} from '@kobato/pack/instance/sea-instance'
import { relaxRateLimits, seedInstalledInstance } from '@kobato/pack/instance/seed'
import { makeTempDirs, smokeDatabases } from '@kobato/pack/instance/temp'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const SHUTDOWN_TIMEOUT_MS = 15_000

export interface SuiteInstance {
  dirs: TempDirs
  databases: SmokeDatabases
  server: SmokeServer
  serverLogPath: string
  baseUrl: string
  adminEmail: string
  adminPassword: string
}

export interface SuiteInstanceOptions {
  adminEmail: string
  log?: (message: string) => void
}

function healthUrl(server: SmokeServer): string {
  return `http://127.0.0.1:${server.port}/health`
}

async function dispose(dirs: TempDirs, server: SmokeServer | null): Promise<void> {
  if (server !== null && !server.exitState.exited) {
    server.child.kill('SIGTERM')
    await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
  }
  await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
}

export async function bootSuiteInstance(binaryPath: string, options: SuiteInstanceOptions): Promise<SuiteInstance> {
  const log = options.log ?? ((): void => undefined)
  await ensureBinaryExists(binaryPath)

  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  const serverLogPath = join(dirs.root, 'server.log')
  const env = seaInstanceEnv(dirs, databases)
  let server: SmokeServer | null = null

  try {
    log(`    binary:   ${binaryPath}`)
    log(`    database: ${databases.database}`)
    log(`    temp dir: ${dirs.root}`)

    const fresh = await bootServer(binaryPath, dirs, env, serverLogPath)
    server = fresh
    log(`    waiting for ${healthUrl(fresh)} (log: ${serverLogPath})`)
    const gate = await waitForHttp(healthUrl(fresh), fresh.exitState)
    if (gate.status !== 303) {
      throw new Error(`expected /health 303 → /admin/setup on a fresh instance, got ${gate.status}`)
    }
    fresh.child.kill('SIGTERM')
    await waitForExit(fresh, SHUTDOWN_TIMEOUT_MS)

    const adminPassword = randomBytes(12).toString('hex')
    await seedInstalledInstance(databases.database, {
      email: options.adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })
    relaxRateLimits(databases.database)

    const seeded = await bootServer(binaryPath, dirs, env, serverLogPath)
    server = seeded
    log(`    waiting for ${healthUrl(seeded)} (seeded restart)`)
    const health = await waitForHttp(healthUrl(seeded), seeded.exitState)
    if (health.status !== 200) {
      throw new Error(`expected /health 200 on the seeded instance, got ${health.status}`)
    }

    return {
      dirs,
      databases,
      server: seeded,
      serverLogPath,
      baseUrl: `http://127.0.0.1:${seeded.port}`,
      adminEmail: options.adminEmail,
      adminPassword,
    }
  } catch (error) {
    await dispose(dirs, server)
    throw error
  }
}

export async function stopSuiteInstance(instance: SuiteInstance): Promise<void> {
  await dispose(instance.dirs, instance.server)
}
