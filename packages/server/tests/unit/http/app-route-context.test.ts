import type { Env } from '@kobato/server/http/context'

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

// Contract: `c.var` set by a root-app middleware survives `app.route()` into
// a sub-app handler. The RR bridge (`src/server/infra/hono/node.ts`) mounts
// `reactRouterApp` via `app.route(basename, …)`, and `buildLoadContext`
// reads `c.var.requestContext` inside it. If Hono ever drops `c.var` across
// this seam, this test fails — and the fix belongs in the bridge (forward
// the value explicitly), not in per-loader fallback re-derivation.

type TestEnv = {
  Variables: {
    requestContext: Env['Variables']['requestContext'] & { marker?: string }
  }
}

function buildApp(mount: string) {
  const app = new Hono<TestEnv>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { marker: 'derived-once' } as unknown as TestEnv['Variables']['requestContext'])
    await next()
  })
  const sub = new Hono<TestEnv>()
  // Mirrors node.ts: the sub-app handler reads c.var with no fallback.
  sub.use(async (c) => c.text(c.var.requestContext?.marker ?? 'DROPPED'))
  app.route(mount, sub)
  return app
}

describe('app.route c.var contract', () => {
  it('keeps c.var visible inside a root-mounted sub-app (production basename)', async () => {
    const res = await buildApp('').request('/posts/anything')
    expect(await res.text()).toBe('derived-once')
  })

  it('keeps c.var visible inside a path-mounted sub-app', async () => {
    const res = await buildApp('/blog').request('/blog/posts')
    expect(await res.text()).toBe('derived-once')
  })
})
