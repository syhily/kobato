import type { ExitState } from '@kobato/instance/process'
import type { ChildProcess } from 'node:child_process'

import { raceChildExit, scrubbedParentEnv, sleep, watchChildExit } from '@kobato/instance/process'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BOOT_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 400
const HEALTH_FETCH_TIMEOUT_MS = 1_500
const BACKEND_PACKAGE = 'kobato'
const ADMIN_PACKAGE = '@kobato/web-admin'
const SAYAKA_PACKAGE = 'sayaka'
const ADMIN_BACKEND_URL_ENV = 'KOBATO_DEV_BACKEND_URL'

export interface DevServer {
  child: ChildProcess
  exitState: ExitState
  port: number
  logPath: string
}

export interface BootBackendDevServerOptions {
  repoRoot: string
  configPath: string
  port: number
  logPath: string
}

export interface BootAdminDevServerOptions {
  repoRoot: string
  port: number
  backendUrl: string
  logPath: string
}

export interface BootSayakaDevServerOptions {
  repoRoot: string
  port: number
  kobatoRpcUrl: string
  logPath: string
}

export async function writeDevConfig(path: string, port: number, dataDir: string): Promise<void> {
  const config = {
    server: { host: '127.0.0.1', port, loggingLevel: 'info' },
    security: {
      sessionSecret: randomBytes(48).toString('hex'),
      encryptionKey: randomBytes(48).toString('hex'),
      trustedProxies: [],
    },
    storage: { data: dataDir, database: '', analyticsDatabase: '', defaultFont: '' },
  }
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
}

function spawnDevServer(
  repoRoot: string,
  packageName: string,
  port: number,
  env: Record<string, string>,
  logPath: string,
): DevServer {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      packageName,
      'run',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
      '--logLevel',
      'warn',
    ],
    {
      cwd: repoRoot,
      env: {
        ...scrubbedParentEnv({ drop: ['VITEST', 'NODE_ENV'] }),
        CI: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const stream = createWriteStream(logPath, { flags: 'w' })
  child.stdout?.pipe(stream)
  child.stderr?.pipe(stream)
  const exitState = watchChildExit(child)
  return { child, exitState, port, logPath }
}

async function waitForDevServer(server: DevServer, probePath: string): Promise<DevServer> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (server.exitState.exited) {
      throw new Error(`DEV server exited during boot (code ${server.exitState.code}); see ${server.logPath}`)
    }
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}${probePath}`, {
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      })
      if (res.status === 200 || res.status === 303) {
        return server
      }
    } catch {}
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`DEV server did not answer ${probePath} within ${BOOT_TIMEOUT_MS / 1000}s; see ${server.logPath}`)
}

export async function bootBackendDevServer(options: BootBackendDevServerOptions): Promise<DevServer> {
  const server = spawnDevServer(
    options.repoRoot,
    BACKEND_PACKAGE,
    options.port,
    { KOBATO_CONFIG_FILE: options.configPath },
    options.logPath,
  )
  return waitForDevServer(server, '/health')
}

export async function bootAdminDevServer(options: BootAdminDevServerOptions): Promise<DevServer> {
  const server = spawnDevServer(
    options.repoRoot,
    ADMIN_PACKAGE,
    options.port,
    { [ADMIN_BACKEND_URL_ENV]: options.backendUrl },
    options.logPath,
  )
  return waitForDevServer(server, '/admin/signin')
}

export async function bootSayakaDevServer(options: BootSayakaDevServerOptions): Promise<DevServer> {
  const server = spawnDevServer(
    options.repoRoot,
    SAYAKA_PACKAGE,
    options.port,
    {
      SAYAKA_HOST: '127.0.0.1',
      SAYAKA_PORT: String(options.port),
      SAYAKA_KOBATO_RPC_URL: options.kobatoRpcUrl,
    },
    options.logPath,
  )
  return waitForDevServer(server, '/')
}

export async function stopDevServer(server: DevServer, timeoutMs: number): Promise<'stopped' | 'timeout'> {
  if (server.exitState.exited) {
    return 'stopped'
  }
  server.child.kill('SIGTERM')
  const outcome = await raceChildExit(server.child, server.exitState, timeoutMs)
  return outcome.timeout ? 'timeout' : 'stopped'
}
