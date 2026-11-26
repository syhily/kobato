import type { Env } from '@sayaka/server/hono-env'

import { createMiddleware } from 'hono/factory'

export function isHtmlContentType(response: Response): boolean {
  return response.headers.get('Content-Type')?.trim().toLowerCase().startsWith('text/html') === true
}

export const cookieRelay = createMiddleware<Env>(async (c, next) => {
  await next()
  const ctx = c.var.sayaka
  if (!ctx || !isHtmlContentType(c.res)) {
    return
  }
  for (const cookie of ctx.responseHeaders.getSetCookie()) {
    c.res.headers.append('Set-Cookie', cookie)
  }
})
