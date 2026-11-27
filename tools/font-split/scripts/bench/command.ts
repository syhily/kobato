import { spawnSync } from 'node:child_process'

export interface CommandOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
}

export interface CommandOutcome {
  status: number | null
  stdout: string
  stderr: string
}

const MAX_OUTPUT_BYTES = 1 << 30
const TAIL_LINES = 40
const NEEDS_SHELL = process.platform === 'win32'

export function runCommand(command: string, args: readonly string[], options: CommandOptions): CommandOutcome {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: NEEDS_SHELL,
  })
  if (result.error) {
    throw new Error(`failed to spawn ${command}: ${result.error.message}`)
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

export function runCommandOrThrow(command: string, args: readonly string[], options: CommandOptions): CommandOutcome {
  const outcome = runCommand(command, args, options)
  if (outcome.status !== 0) {
    const output = (outcome.stderr.trim() || outcome.stdout.trim()).split('\n').slice(-TAIL_LINES).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${outcome.status ?? 'unknown'}\n${output}`)
  }
  return outcome
}
