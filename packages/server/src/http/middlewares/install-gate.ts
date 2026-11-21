import type { Env } from '@kobato/server/http/hono-env'

import { getInstallState } from '@kobato/server/domains/settings/install-gate'
import { errorJsonResponse } from '@kobato/server/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { createMiddleware } from 'hono/factory'

const log = getLogger('install.gate')

const EXEMPT_PATHS = new Set(['/admin/signin', '/admin/setup', '/api/setup/restore', '/api/rum/status', '/ready'])

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
  '/api/rum/intake/',
]

function isExempt(pathname: string): boolean {
  if (EXEMPT_PATHS.has(pathname)) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export const honoInstallGateMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isExempt(c.var.requestContext.url.pathname)) {
    return next()
  }

  let state: Awaited<ReturnType<typeof getInstallState>>
  try {
    state = await getInstallState(c.var.requestContext.db)
  } catch (error) {
    log.error('Install gate failed to determine install state', { error })
    return errorJsonResponse(c, 503, 'error.api.serviceUnavailable')
  }

  if (state === 'installed') {
    return next()
  }
  return c.redirect('/admin/setup', 303)
})
