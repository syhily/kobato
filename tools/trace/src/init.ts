import {
  fail,
  log,
  o2Context,
  readState,
  RETENTION_DAYS,
  stateFilePath,
  waitForOpenObserve,
  warn,
} from '@kobato/trace/lib'
import { applyRetention } from '@kobato/trace/provision'

async function main(): Promise<void> {
  const state = await readState()
  if (state === null) {
    fail('No OpenObserve development state. Run `pnpm run trace:up` first.')
  }
  await waitForOpenObserve(state.endpoint)
  const ctx = o2Context(state)

  const retention = await applyRetention(ctx)
  if (retention.missing) {
    warn(
      '    no telemetry streams exist yet; run `pnpm run trace:init` again after one request so 1-day retention is applied',
    )
  } else {
    log(`==> retention: ${RETENTION_DAYS} day applied to ${retention.applied} stream(s) (others already set)`)
  }

  log('')
  log('==> enter these in Admin → Settings → Observability, then press "Test connection"')
  log(`    endpoint:       ${state.endpoint}`)
  log(`    organization:   ${state.organization}   (also the RUM application id)`)
  log(`    username:       ${state.adminEmail}`)
  log(`    password:       read "adminPassword" from ${stateFilePath()} (never printed)`)
  log('    enable tracing, server logs, and frontend RUM in the same panel, then save')
  log('')
  log('    "Test connection" verifies the credentials, ensures the organization, installs the RUM')
  log('    privacy pipeline/function and the four dashboards, and writes the RUM client token')
  log('    back into the encrypted settings row. Nothing else is required in dev.')
  log('    Browser RUM relays through the app origin (/api/rum/intake); OpenObserve CORS is not involved.')
  log(`    state (never commit): ${stateFilePath()}`)
}

try {
  await main()
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
