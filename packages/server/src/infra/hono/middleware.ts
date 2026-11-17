import { createMiddleware } from 'hono/factory'

export function cache(seconds: number) {
  return createMiddleware(async (c, next) => {
    if (!/\.[a-zA-Z0-9]+$/.test(c.req.path) || c.req.path.endsWith('.data')) {
      return next()
    }

    await next()

    if (!c.res.ok || c.res.headers.has('cache-control')) {
      return
    }

    c.res.headers.set('cache-control', `public, max-age=${seconds}`)
  })
}
