import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { activeFrontendRum } from '@/server/infra/trace/config'

/**
 * DEV-only frontend RUM drift signal (ADR-0012). Boolean only: no client
 * token, no endpoint/status detail, no credentials. `no-store` keeps a stale
 * gate from being cached, and the pipeline mounts this router only in DEV.
 */
export const devRumStatusRouter = new Hono<Env>().get('/api/dev/rum/status', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ enabled: activeFrontendRum() !== null })
})
