import type { Context } from 'hono'

import { peekRestoreJobPhase } from '@/server/domains/backup/restore-machine'
import { getServerPhase } from '@/server/infra/lifecycle'

/** Readiness probe: 200 while running; 503 with the restore machine's
 *  non-consuming phase projection while a restart/restore is in flight. */
export function readyHandler(c: Context): Response {
  const phase = getServerPhase()
  if (phase !== 'running') {
    return c.json({ status: phase, restore: peekRestoreJobPhase() }, 503)
  }
  return c.json({ status: 'ok' })
}
