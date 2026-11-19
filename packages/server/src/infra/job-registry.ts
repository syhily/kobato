import type { Database, DatabaseHandle } from '@kobato/db/database.ts'

import { getLogger } from '@kobato/server/infra/logger.ts'
import { scheduleJob, type ScheduledJob, type ScheduledJobTask } from '@kobato/server/infra/scheduler-utils.ts'

const log = getLogger('job-registry')

interface JobRegistration {
  name: string
  nextDelayMs: () => number | null
  run: () => Promise<void> | void
  task?: ScheduledJobTask
}

interface JobEntry extends JobRegistration {
  instance: ScheduledJob | undefined
}

const entries: JobEntry[] = []

export function registerJob(registration: JobRegistration): void {
  const index = entries.findIndex((entry) => entry.name === registration.name)
  if (index !== -1) {
    entries[index]!.instance?.stop()
    entries[index] = { ...registration, instance: undefined }
    return
  }
  entries.push({ ...registration, instance: undefined })
}

let getHandle: (() => DatabaseHandle) | null = null

export function setJobHandleGetter(deps: { getDatabaseHandle: () => DatabaseHandle }): void {
  getHandle = deps.getDatabaseHandle
}

export function jobHandle(): DatabaseHandle {
  if (getHandle === null) {
    throw new Error('background job evaluated before the database handle was wired')
  }
  return getHandle()
}

export function jobDb(): Database {
  return jobHandle().db
}

function arm(entry: JobEntry): void {
  entry.instance ??= scheduleJob({
    name: entry.name,
    nextDelayMs: entry.nextDelayMs,
    run: entry.run,
    task: entry.task,
  })
  entry.instance.reschedule()
}

export function scheduleRegisteredJob(name: string): void {
  const entry = entries.find((candidate) => candidate.name === name)
  if (!entry) {
    return
  }
  arm(entry)
}

export function startAllRegisteredJobs(): void {
  for (const entry of entries) {
    arm(entry)
  }
  log.debug('background jobs started', { count: entries.length })
}

export function nudgeRegisteredJob(name: string): void {
  entries.find((candidate) => candidate.name === name)?.instance?.reschedule()
}

export function __resetJobRegistrationsForTests(): void {
  for (const entry of entries) {
    entry.instance?.stop()
  }
  entries.length = 0
}
