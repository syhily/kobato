import type { Env } from '@kobato/server/http/hono-env.ts'

import { activeFrontendRum } from '@kobato/server/infra/trace/config.ts'
import { Hono } from 'hono'

export const rumStatusRouter = new Hono<Env>().get('/api/rum/status', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ enabled: activeFrontendRum() !== null })
})
