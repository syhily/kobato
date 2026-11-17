// `pnpm run trace:up` — start the single-container OpenObserve development
// instance. Idempotent, loopback-only, dedicated volume, never required by
// normal development.

import {
  buildState,
  ensureDocker,
  log,
  readState,
  startOpenObserve,
  stateFilePath,
  waitForOpenObserve,
  writeState,
} from './lib.ts'

async function main(): Promise<void> {
  ensureDocker()
  const existing = await readState()
  const state = existing ?? buildState()
  if (existing === null) {
    await writeState(state)
  }
  const instance = startOpenObserve(state)
  await waitForOpenObserve(instance.endpoint)
  log(`==> OpenObserve is ready at ${instance.endpoint} (${instance.containerName})`)
  log(`    image:  openobserve/openobserve:v1.1.2`)
  log(`    volume: ${instance.volumeName}`)
  log(`    state:  ${stateFilePath()} (mode 0600; contains development credentials)`)
  log('    next:   pnpm run trace:init')
  if (!instance.created) {
    log('    note:   reused an existing instance; data from earlier runs is still present')
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
