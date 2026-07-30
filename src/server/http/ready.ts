import type { Context } from 'hono'

import { peekRestoreJobPhase } from '@/server/domains/backup/restore-machine'
import { getServerPhase } from '@/server/infra/lifecycle'

/**
 * The readiness probe. Extraction owner of what used to be inlined in
 * the pipeline (and re-implemented in two test files): 200 while the
 * server is running; 503 with the restore machine's non-consuming
 * phase projection while a restart/restore is in flight, so a liveness
 * poll can watch the restore progress without eating the terminal
 * report the admin endpoint waits to show.
 */
export function readyHandler(c: Context): Response {
  const phase = getServerPhase()
  if (phase !== 'running') {
    return c.json({ status: phase, restore: peekRestoreJobPhase() }, 503)
  }
  return c.json({ status: 'ok' })
}
