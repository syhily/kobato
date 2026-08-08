import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { getInstallState } from '@/server/domains/settings/install-gate'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('install.gate')

const EXEMPT_PATHS = new Set(['/admin/signin', '/admin/setup', '/api/setup/restore', '/ready'])

const EXEMPT_PATH_PREFIXES = [
  '/assets/',
  '/build/',
  '/fonts/',
  '/images/',
  '/favicon',
  '/logo',
  '/apple-touch-icon',
  '/robots.txt',
  '/sitemap.xml',
  '/__manifest',
]

function isExempt(pathname: string): boolean {
  if (EXEMPT_PATHS.has(pathname)) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export const honoInstallGateMiddleware = createMiddleware<Env>(async (c, next) => {
  // `requestContext.url` is the normalized document URL — `.data` is already stripped.
  if (isExempt(c.var.requestContext.url.pathname)) {
    return next()
  }

  let state: Awaited<ReturnType<typeof getInstallState>>
  try {
    state = await getInstallState(c.var.requestContext.db)
  } catch (error) {
    log.error('Install gate failed to determine install state', { error })
    return c.json({ error: { message: 'Service temporarily unavailable' } }, 503)
  }

  if (state === 'installed') {
    return next()
  }
  return c.redirect('/admin/setup', 303)
})
