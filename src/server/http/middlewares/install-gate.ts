import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { getInstallState } from '@/server/domains/settings/install-gate'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('install.gate')

const EXEMPT_PATHS = new Set(['/admin/signin', '/admin/setup'])

const EXEMPT_PATH_PREFIXES = [
  '/assets/',
  '/build/',
  '/fonts/',
  '/images/',
  '/favicon',
  '/robots.txt',
  '/sitemap.xml',
  '/__manifest',
]

function isExempt(pathname: string): boolean {
  // React Router data requests append `.data` to the pathname (e.g.
  // `/admin/setup.data`). Strip the suffix so the gate
  // recognises exempt install / login routes and static assets.
  const basePath = pathname.replace(/\.data$/, '')
  if (EXEMPT_PATHS.has(basePath)) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => basePath.startsWith(prefix))
}

export const honoInstallGateMiddleware = createMiddleware<Env>(async (c, next) => {
  const url = new URL(c.req.url)

  if (isExempt(url.pathname)) {
    return next()
  }

  let state: Awaited<ReturnType<typeof getInstallState>>
  try {
    state = await getInstallState()
  } catch (error) {
    log.error('Install gate failed to determine install state; letting request through', { error })
    return next()
  }

  if (state === 'installed') {
    return next()
  }
  return c.redirect('/admin/setup', 303)
})
