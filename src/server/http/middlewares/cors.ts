import type { MiddlewareHandler } from 'hono'

import { cors } from 'hono/cors'

import type { Env } from '@/server/http/context'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// CORS from `security` settings (live, no restart). No-op when disabled or
// pre-install; when enabled, only listed origins get headers — never reflect
// the request origin with credentials: true.
export function corsMiddleware(): MiddlewareHandler<Env> {
  const handler = cors({
    origin: (origin) => {
      const settings = getBlogSettingsBundleSync()?.security
      if (!settings || settings.cors.origins.length === 0) {
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
