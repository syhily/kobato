// `pnpm run trace:down [-- --volumes]` — stop and remove the development
// container. Data survives unless `--volumes` is explicit.

import { rm } from 'node:fs/promises'

import { log, readState, stateFilePath, stopOpenObserve, warn } from './lib.ts'

const removeVolumes = process.argv.includes('--volumes') || process.argv.includes('--purge')

async function main(): Promise<void> {
  const state = await readState()
  if (state === null) {
    log('No OpenObserve development state found; nothing to stop.')
    return
  }
  const result = stopOpenObserve(state.containerName, removeVolumes, state.volumeName)
  if (removeVolumes && result.refused) {
    warn('==> kept state: a Docker resource lacks the kobato.trace=development label')
  } else if (removeVolumes) {
    await rm(stateFilePath(), { force: true })
    log('==> removed development state (container, volume, credentials)')
  } else {
    log('==> stopped container; volume and credentials kept (pass --volumes to delete them)')
  }
}

try {
  await main()
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
