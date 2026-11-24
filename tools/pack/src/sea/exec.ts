import { fail } from '@kobato/pack/process'
import { repoRoot } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'

interface RunOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
}

const NEEDS_SHELL = process.platform === 'win32'

export function run(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: NEEDS_SHELL, ...options })
  if (result.error) {
    fail(`Failed to spawn ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`Command failed with exit code ${result.status ?? 'unknown'}: ${command} ${args.join(' ')}`)
  }
}

export function tryRun(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: NEEDS_SHELL, ...options })
  if (result.error || result.status !== 0) {
    console.warn(`Warning: ${command} ${args.join(' ')} failed (ignored)`)
  }
}
