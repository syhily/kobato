import type { Context } from 'hono'

import { peekRestoreJobPhase } from '@kobato/server/domains/backup/restore-machine'
import { getServerPhase } from '@kobato/server/infra/lifecycle'

export function readyHandler(c: Context): Response {
  const phase = getServerPhase()
  if (phase !== 'running') {
    return c.json({ status: phase, restore: peekRestoreJobPhase() }, 503)
  }
  return c.json({ status: 'ok' })
}
