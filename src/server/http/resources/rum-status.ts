import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { activeFrontendRum } from '@/server/infra/trace/config'

/**
 * Frontend RUM drift signal. Boolean only: no client token, no
 * endpoint/status detail, no credentials. `no-store` keeps a stale gate from
 * being cached.
 *
 * Mounted in EVERY build (the gate lives inside the handler, because a settings
 * change never re-mounts the router), and excluded from HTTP traces and RUM
 * activity/resources by path. An open browser polls this to follow the gate
 * both ways without a reload.
 */
export const rumStatusRouter = new Hono<Env>().get('/api/rum/status', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ enabled: activeFrontendRum() !== null })
})
