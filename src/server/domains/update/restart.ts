// Self-restart after a successful binary swap (plan 090). Kept in its own
// module so tests can mock the whole seam — `process.exit` must never fire
// inside a vitest worker.
//
// The replacement process is spawned detached with the same argv tail;
// `env` is intentionally omitted because spawn already inherits the
// parent's environment by default (and raw environment reads are
// centralised in `infra/env.ts` by the boundaries contract).

import { spawn } from 'node:child_process'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('update.restart')

export function scheduleSelfRestart(delayMs = 1_000): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
  })
  child.unref()
  log.info('self-update swapped the binary; restarting', { pid: child.pid ?? null })
  setTimeout(() => {
    process.exit(0)
  }, delayMs)
}
