import { findNextScheduledPublishAt } from '@kobato/db/sqlite/operations/content/post-schedule'
import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { jobDb, nudgeRegisteredJob, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('content.scheduled-publish')

function nextScheduledPublishDelayMs(): number | null {
  const next = findNextScheduledPublishAt(jobDb())
  if (next === null) {
    return null
  }
  return Math.max(next.getTime() - Date.now(), 0)
}

function runScheduledPublish(): void {
  invalidateContent({ entity: 'post' })
  invalidateContent({ entity: 'page' })
  log.info('Scheduled publish reached; public caches invalidated')
}

registerJob({
  name: 'content.scheduled-publish',
  task: { key: 'scheduled-publish', recordHistory: true },
  nextDelayMs: nextScheduledPublishDelayMs,
  run: runScheduledPublish,
})

export function rescheduleScheduledPublish(): void {
  nudgeRegisteredJob('content.scheduled-publish')
}
