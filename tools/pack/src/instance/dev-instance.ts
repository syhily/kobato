import type { ExitState } from '@kobato/pack/instance/process'
import type { ChildProcess } from 'node:child_process'

import { raceChildExit, scrubbedParentEnv, sleep, watchChildExit } from '@kobato/pack/instance/process'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BOOT_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 400
const HEALTH_FETCH_TIMEOUT_MS = 1_500

export interface DevServer {
  child: ChildProcess
  exitState: ExitState
  port: number
  logPath: string
}

export interface BootDevServerOptions {
  repoRoot: string
  configPath: string
  port: number
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

export async function bootDevServer(options: BootDevServerOptions): Promise<DevServer> {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'react-router',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.port),
      '--strictPort',
      '--logLevel',
      'warn',
    ],
    {
      cwd: options.repoRoot,
      env: {
        ...scrubbedParentEnv({ drop: ['VITEST', 'NODE_ENV'] }),
        KOBATO_CONFIG_FILE: options.configPath,
        CI: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const stream = createWriteStream(options.logPath, { flags: 'w' })
  child.stdout?.pipe(stream)
  child.stderr?.pipe(stream)
  const exitState = watchChildExit(child)
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (exitState.exited) {
      throw new Error(`DEV server exited during boot (code ${exitState.code}); see ${options.logPath}`)
    }
    try {
      const res = await fetch(`http://127.0.0.1:${options.port}/health`, {
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      })
      if (res.ok) {
        return { child, exitState, port: options.port, logPath: options.logPath }
      }
    } catch {}
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`DEV server did not answer /health within ${BOOT_TIMEOUT_MS / 1000}s; see ${options.logPath}`)
}

export async function stopDevServer(server: DevServer, timeoutMs: number): Promise<'stopped' | 'timeout'> {
  if (server.exitState.exited) {
    return 'stopped'
  }
  server.child.kill('SIGTERM')
  const outcome = await raceChildExit(server.child, server.exitState, timeoutMs)
  return outcome.timeout ? 'timeout' : 'stopped'
}
