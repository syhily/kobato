// `pnpm run trace:init` — finish the development OpenObserve container setup
// and print the values an admin enters in Settings → Observability.
//
// The server owns asset provisioning: saving the section and pressing "Test
// connection" verifies the credentials AND installs the RUM token, the privacy
// pipeline/function, and the four versioned dashboards (idempotently). The dev
// tooling therefore keeps only the container-only policy — 1-day retention —
// and must never print a credential. Writing the DB row directly was rejected:
// the password column is encrypted with a key derived inside the SERVER process
// (`security.encryptionKey` + the server crypto module), so a dev script would
// have to parse the DEV config and duplicate that derivation. Printing the
// non-secret values (and pointing at the 0600 state file for the password) is
// simpler and cannot corrupt an encrypted settings row.

import { fail, log, o2Context, readState, RETENTION_DAYS, stateFilePath, waitForOpenObserve, warn } from './lib.ts'
import { applyRetention } from './provision.ts'

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
  log(`    OpenObserve CORS must include the exact DEV origin (trace:up sets localhost/127.0.0.1:4321).`)
  log(`    state (never commit): ${stateFilePath()}`)
}

try {
  await main()
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
