import type { MiddlewareHandler } from 'hono'

import { cors } from 'hono/cors'

import type { Env } from '@/server/http/context'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// CORS middleware for API and SSR routes. Reads configuration from the
// blog settings system (`security` section) so the admin can update origins
// from `/admin/settings/security` without a restart.
//
//   - `security.cors.enabled === false` (default) → middleware is a no-op; no
//     CORS headers are added. Same-origin requests work as usual.
//   - `security.cors.enabled === true` + non-empty `origins` → only listed
//     origins receive CORS headers.
//   - `security.cors.enabled === true` + empty `origins` → mirror mode: the
//     request's Origin header is reflected back.
//   - Pre-install (bundle is null) → no-op so the install wizard
//     works without CORS side effects.
export function corsMiddleware(): MiddlewareHandler<Env> {
  const handler = cors({
    origin: (origin) => {
      const settings = getBlogSettingsBundleSync()?.security
      if (!settings || settings.cors.origins.length === 0) {
        // CORS is enabled but no origins are configured — refuse CORS entirely.
        // Never reflect the request origin when credentials: true is set.
        return ''
      }
      return settings.cors.origins.filter((o) => o.length > 0).includes(origin ?? '') ? (origin ?? '') : ''
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    maxAge: 86400,
    credentials: true,
  })

  return async (c, next) => {
    const settings = getBlogSettingsBundleSync()?.security
    if (!settings || !settings.cors.enabled) {
      return next()
    }
    return handler(c, next)
  }
}
