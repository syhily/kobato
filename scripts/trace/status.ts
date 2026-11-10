// `pnpm run trace:status` — inspect the local OpenObserve instance without
// printing credentials. Dashboards and the RUM privacy pipeline are installed by
// the SERVER during the admin connection test; this command only observes them,
// so a missing asset means the panel has not been configured and tested yet.

import { RUM_PRIVACY_PIPELINE_NAME } from '../../src/shared/contracts/trace-pipeline.ts'
import {
  containerExists,
  containerRunning,
  isRelevantTraceStream,
  listDashboards,
  listStreams,
  log,
  o2Context,
  o2Json,
  readState,
  stateFilePath,
  waitForOpenObserve,
} from './lib.ts'

async function main(): Promise<void> {
  const state = await readState()
  if (state === null) {
    log('No OpenObserve development state. Run `pnpm run trace:up` first.')
    return
  }
  log(`state:     ${stateFilePath()}`)
  log(`container: ${state.containerName} (${containerRunning(state.containerName) ? 'running' : 'stopped'})`)
  log(`volume:    ${state.volumeName}`)
  log(`endpoint:  ${state.endpoint}`)
  log(`org:       ${state.organization}   (site name = OpenObserve organization = RUM application id)`)
  log(`username:  ${state.adminEmail}`)
  log(
    `settings:  enter endpoint/organization/username (+ the state file's adminPassword) in Admin → Settings → Observability`,
  )
  if (!containerExists(state.containerName) || !containerRunning(state.containerName)) {
    log('OpenObserve is not running.')
    return
  }
  await waitForOpenObserve(state.endpoint, 15_000).catch(() => undefined)
  const ctx = o2Context(state)
  const dashboards = await listDashboards(ctx).catch(() => [])
  log(`dashboards: ${dashboards.length === 0 ? 'none imported' : dashboards.map((entry) => entry.title).join(', ')}`)
  for (const type of ['logs', 'traces', 'metrics'] as const) {
    const streams = await listStreams(ctx, type).catch(() => [])
    const relevant = streams.filter((stream) => isRelevantTraceStream(stream.name))
    if (relevant.length === 0) {
      continue
    }
    log(`${type} streams:`)
    for (const stream of relevant) {
      const retention = stream.settings?.data_retention ?? 0
      const suffix = retention === 1 ? '1 day' : retention === 0 ? 'server default (not set)' : `${retention} days`
      log(`  ${stream.name}: retention ${suffix}`)
    }
  }
  const pipelines = await o2Json<{ list?: Array<{ name?: string; enabled?: boolean }> }>(ctx, '/pipelines').catch(
    () => ({ list: [] }),
  )
  const privacy = (pipelines.list ?? []).find((entry) => entry.name === RUM_PRIVACY_PIPELINE_NAME)
  log(`RUM privacy pipeline: ${privacy === undefined ? 'missing' : privacy.enabled === false ? 'disabled' : 'enabled'}`)
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
