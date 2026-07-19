// Process helpers for the SEA build scripts: fail-fast wrappers around
// spawnSync with inherited stdio so build progress stays visible.

import { spawnSync } from 'node:child_process'

import { repoRoot } from './paths.ts'

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

interface RunOptions {
  env?: NodeJS.ProcessEnv
}

export function run(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
  if (result.error) {
    fail(`Failed to spawn ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`Command failed with exit code ${result.status ?? 'unknown'}: ${command} ${args.join(' ')}`)
  }
}

/** Best-effort variant of `run` — logs a warning instead of failing. */
export function tryRun(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) {
    console.warn(`Warning: ${command} ${args.join(' ')} failed (ignored)`)
  }
}
