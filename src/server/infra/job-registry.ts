import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('job-registry')

// Registry for the process-level background jobs (backup, audit archive,
// scheduled publish, webmention queues, maintenance sweeps, GeoIP), each
// self-registering at import time. The hydration phase starts every
// registered job in one loop after settings load — adding a timer means
// editing only its own module. Timer mechanics stay in scheduler-utils
// (`scheduleJob`); this registry owns boot sequencing and the shared
// db-handle getter so domains don't each carry a wire preamble.

interface JobRegistration {
  /** Logger scope and registry key (`scheduleJob`'s `name`). */
  name: string
  /** Milliseconds until the next fire, or `null` to suspend (re-check later). */
  nextDelayMs: () => number | null
  run: () => Promise<void> | void
}

interface JobEntry extends JobRegistration {
  instance: ScheduledJob | undefined
}

const entries: JobEntry[] = []

/**
 * Register a job (called at module scope). Re-registering a name replaces
 * the entry — HMR-safe.
 */
export function registerJob(registration: JobRegistration): void {
  const index = entries.findIndex((entry) => entry.name === registration.name)
  if (index !== -1) {
    // HMR re-registration: stop the replaced instance's pending fire.
    entries[index]!.instance?.stop()
    entries[index] = { ...registration, instance: undefined }
    return
  }
  entries.push({ ...registration, instance: undefined })
}

// The db-handle getter is injected by the composition root (pre-migration)
// and invoked when a job evaluates, so a reopened handle (restore
// completion) is picked up without per-module state.

let getHandle: (() => DatabaseHandle) | null = null

export function setJobHandleGetter(deps: { getDatabaseHandle: () => DatabaseHandle }): void {
  getHandle = deps.getDatabaseHandle
}

/** The wired handle getter — throws if a job somehow evaluates pre-wiring. */
export function jobHandle(): DatabaseHandle {
  if (getHandle === null) {
    throw new Error('background job evaluated before the database handle was wired')
  }
  return getHandle()
}

/** The current content db — the lazy getter jobs close over at run time. */
export function jobDb(): Database {
  return jobHandle().db
}

function arm(entry: JobEntry): void {
  entry.instance ??= scheduleJob({ name: entry.name, nextDelayMs: entry.nextDelayMs, run: entry.run })
  entry.instance.reschedule()
}

/** Create-or-reschedule ONE registered job (settings-change reschedules, post-restore archive re-arm). */
export function scheduleRegisteredJob(name: string): void {
  const entry = entries.find((candidate) => candidate.name === name)
  // Unknown name: the module owning the job was never imported — nothing to arm.
  if (!entry) {
    return
  }
  arm(entry)
}

/** Create-or-reschedule EVERY registered job — the hydration phase calls this once, after settings load. */
export function startAllRegisteredJobs(): void {
  for (const entry of entries) {
    arm(entry)
  }
  log.debug('background jobs started', { count: entries.length })
}

/** Nudge an already-running job WITHOUT creating it — enqueue-path nudge; no-op before boot start. */
export function nudgeRegisteredJob(name: string): void {
  entries.find((candidate) => candidate.name === name)?.instance?.reschedule()
}

/** Test seam: stop and drop every registration (unit-test isolation). */
export function __resetJobRegistrationsForTests(): void {
  for (const entry of entries) {
    entry.instance?.stop()
  }
  entries.length = 0
}
