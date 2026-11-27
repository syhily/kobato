import type { SmokeServer } from '@kobato/instance/sea-instance'
import type { SmokeDatabases, TempDirs } from '@kobato/instance/temp'

import { pickFreePort } from '@kobato/instance/process'
import {
  bootSayakaServer,
  bootServer,
  ensureBinaryExists,
  sayakaInstanceEnv,
  seaInstanceEnv,
  waitForExit,
  waitForHttp,
} from '@kobato/instance/sea-instance'
import { relaxRateLimits, seedInstalledInstance } from '@kobato/instance/seed'
import { makeTempDirs, smokeDatabases } from '@kobato/instance/temp'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const SHUTDOWN_TIMEOUT_MS = 15_000

export interface SuiteInstance {
  dirs: TempDirs
  databases: SmokeDatabases
  server: SmokeServer
  sayaka: SmokeServer
  serverLogPath: string
  sayakaLogPath: string
  baseUrl: string
  publicBaseUrl: string
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

async function stopServer(server: SmokeServer | null): Promise<void> {
  if (server !== null && !server.exitState.exited) {
    server.child.kill('SIGTERM')
    await waitForExit(server, SHUTDOWN_TIMEOUT_MS)
  }
}

async function dispose(dirs: TempDirs, kobato: SmokeServer | null, sayaka: SmokeServer | null): Promise<void> {
  await stopServer(sayaka)
  await stopServer(kobato)
  await rm(dirs.root, { recursive: true, force: true }).catch(() => undefined)
}

export async function bootSuiteInstance(
  kobatoBinaryPath: string,
  sayakaBinaryPath: string,
  options: SuiteInstanceOptions,
): Promise<SuiteInstance> {
  const log = options.log ?? ((): void => undefined)
  await ensureBinaryExists(kobatoBinaryPath)
  await ensureBinaryExists(sayakaBinaryPath)

  const dirs = await makeTempDirs()
  const databases = smokeDatabases(dirs)
  const serverLogPath = join(dirs.root, 'kobato.log')
  const sayakaLogPath = join(dirs.root, 'sayaka.log')
  const env = seaInstanceEnv(dirs, databases)
  const kobatoPort = await pickFreePort()
  const sayakaPort = await pickFreePort()
  const publicBaseUrl = `http://127.0.0.1:${sayakaPort}`
  let kobato: SmokeServer | null = null
  let sayaka: SmokeServer | null = null

  try {
    log(`    kobato:   ${kobatoBinaryPath}`)
    log(`    sayaka:   ${sayakaBinaryPath}`)
    log(`    database: ${databases.database}`)
    log(`    temp dir: ${dirs.root}`)

    const fresh = await bootServer(kobatoBinaryPath, dirs, env, serverLogPath, { port: kobatoPort })
    kobato = fresh
    log(`    waiting for ${healthUrl(fresh)} (log: ${serverLogPath})`)
    const gate = await waitForHttp(healthUrl(fresh), fresh.exitState)
    if (gate.status !== 303) {
      throw new Error(`expected /health 303 → /admin/setup on a fresh instance, got ${gate.status}`)
    }

    const freshSayaka = await bootSayakaServer(
      sayakaBinaryPath,
      sayakaInstanceEnv(`http://127.0.0.1:${kobatoPort}`, sayakaPort),
      sayakaLogPath,
      { cwd: dirs.cwd },
    )
    sayaka = freshSayaka
    log(`    waiting for ${publicBaseUrl}/ (sayaka install gate; log: ${sayakaLogPath})`)
    const sayakaGate = await waitForHttp(`${publicBaseUrl}/`, freshSayaka.exitState)
    if (
      sayakaGate.status !== 303 ||
      new URL(sayakaGate.headers.get('location') ?? '', publicBaseUrl).pathname !== '/admin/setup'
    ) {
      throw new Error(
        `expected sayaka / 303 → /admin/setup on a fresh instance, got ${sayakaGate.status} location=${sayakaGate.headers.get('location') ?? '(none)'}`,
      )
    }

    await stopServer(kobato)
    kobato = null
    const adminPassword = randomBytes(12).toString('hex')
    await seedInstalledInstance(databases.database, {
      email: options.adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    })
    relaxRateLimits(databases.database)

    const seeded = await bootServer(kobatoBinaryPath, dirs, env, serverLogPath, { port: kobatoPort })
    kobato = seeded
    log(`    waiting for ${healthUrl(seeded)} (seeded restart behind the running sayaka)`)
    const health = await waitForHttp(healthUrl(seeded), seeded.exitState)
    if (health.status !== 200) {
      throw new Error(`expected /health 200 on the seeded instance, got ${health.status}`)
    }
    const home = await waitForHttp(`${publicBaseUrl}/`, sayaka.exitState)
    if (home.status !== 200) {
      throw new Error(`expected sayaka / 200 on the seeded instance, got ${home.status}`)
    }

    return {
      dirs,
      databases,
      server: seeded,
      sayaka,
      serverLogPath,
      sayakaLogPath,
      baseUrl: `http://127.0.0.1:${kobatoPort}`,
      publicBaseUrl,
      adminEmail: options.adminEmail,
      adminPassword,
    }
  } catch (error) {
    await dispose(dirs, kobato, sayaka)
    throw error
  }
}

export async function stopSuiteInstance(instance: SuiteInstance): Promise<void> {
  await dispose(instance.dirs, instance.server, instance.sayaka)
}
