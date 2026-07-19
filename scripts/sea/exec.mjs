// Process helpers for the SEA build scripts: fail-fast wrappers around
// spawnSync with inherited stdio so build progress stays visible.

import { spawnSync } from 'node:child_process'

import { repoRoot } from './paths.mjs'

export function fail(message) {
  console.error(message)
  process.exit(1)
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
  if (result.error) {
    fail(`Failed to spawn ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`Command failed with exit code ${result.status ?? 'unknown'}: ${command} ${args.join(' ')}`)
  }
}

/** Best-effort variant of `run` — logs a warning instead of failing. */
export function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) {
    console.warn(`Warning: ${command} ${args.join(' ')} failed (ignored)`)
  }
}
