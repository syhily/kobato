// `pnpm run trace:init` — provision the development OpenObserve instance:
// RUM token, 1-day stream retention, the RUM privacy pipeline, and the four
// versioned dashboards. Credentials come from the mode-0600 state file (or
// explicit KOBATO_TRACE_* env overrides) and are never printed.

import {
  RUM_PRIVACY_FUNCTION_NAME,
  RUM_PRIVACY_PIPELINE_NAME,
  RUM_PRIVACY_PIPELINE_VERSION,
} from '../../src/shared/contracts/trace-pipeline.ts'
import {
  fail,
  log,
  o2Context,
  readState,
  RETENTION_DAYS,
  stateFilePath,
  waitForOpenObserve,
  warn,
  writeState,
  writeTraceConfigFragment,
} from './lib.ts'
import { ensureRumToken, provisionOpenObserve } from './provision.ts'

async function main(): Promise<void> {
  const initial = await readState()
  if (initial === null) {
    fail('No OpenObserve development state. Run `pnpm run trace:up` first.')
  }
  await waitForOpenObserve(initial.endpoint)
  const state = await ensureRumToken(o2Context(initial), initial, async (next) => {
    await writeState(next)
  })
  const ctx = o2Context(state)

  const report = await provisionOpenObserve(ctx)
  log(
    `==> RUM privacy pipeline ${RUM_PRIVACY_PIPELINE_NAME} v${RUM_PRIVACY_PIPELINE_VERSION} installed (function ${RUM_PRIVACY_FUNCTION_NAME})`,
  )
  log(`==> imported ${report.dashboards} dashboards`)
  if (report.retention.missing) {
    warn(
      '    no telemetry streams exist yet; run `pnpm run trace:init` again after one request so 1-day retention is applied',
    )
  } else {
    log(`==> retention: ${RETENTION_DAYS} day applied to ${report.retention.applied} stream(s) (others already set)`)
  }

  const fragment = await writeTraceConfigFragment(state)
  log('==> config fragment written (secrets included, mode 0600)')
  log(`    fragment: ${fragment}`)
  log(`    state:    ${stateFilePath()}`)
  log(`    endpoint: ${state.endpoint} (org ${state.organization})`)
  log(`    applicationId: ${state.applicationId}`)
  log('    Merge the "trace" block (traces, metrics, server logs, frontend RUM) into kobato.config.json.')
  log('    Restart the DEV server afterwards; trace.* is a boot-time snapshot.')
  log('    Do not commit the fragment: it carries server and RUM credentials.')
  log('    OpenObserve CORS must include the exact DEV origin (trace:up sets localhost/127.0.0.1:4321).')
}

try {
  await main()
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
