import type { Env } from '@kobato/server/http/hono-env'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { user } from '@kobato/db/sqlite/schema/user'
import { normalizeDocumentUrl } from '@kobato/server/http/request/request-facts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// oxfmt-ignore
const EXEMPT_CASES = [
  { path: '/admin/assets/entry-abc.js', desc: 'workspace asset prefix' },
  { path: '/admin/signin',          desc: 'admin signin' },
  { path: '/admin/setup',           desc: 'admin setup' },
  { path: '/rpc/account/setup/restore', desc: 'setup restore RPC' },
  { path: '/rpc/account/setup/status', desc: 'setup status RPC' },
  { path: '/rpc/account/setup/verifyToken', desc: 'setup verify-token RPC' },
  { path: '/rpc/account/setup/install', desc: 'setup install RPC' },
  { path: '/rpc/public/branding/asset', desc: 'branding asset RPC' },
  { path: '/rpc/public/content/bootstrap', desc: 'public bootstrap RPC' },
  { path: '/ready',                 desc: 'ready endpoint' },
  { path: '/rpc/public/observability/rumStatus', desc: 'frontend RUM status RPC' },
  { path: '/rpc/public/observability/rumIntake', desc: 'frontend RUM intake RPC' },
  { path: '/rpc/public/webmentions/receive', desc: 'webmention receive RPC' },
  { path: '/admin/signin.data',     desc: 'RR data suffix' },
]

// oxfmt-ignore
const BLOCKED_CASES = [
  { path: '/',                    desc: 'root path' },
  { path: '/posts/hello',         desc: 'public post' },
  { path: '/about',               desc: 'page route' },
  { path: '/robots.txt',          desc: 'robots.txt (sayaka-served now)' },
  { path: '/sitemap.xml',         desc: 'sitemap.xml (sayaka-served now)' },
  { path: '/fonts/Inter.woff2',   desc: 'former fonts resource' },
  { path: '/images/avatar/1.png', desc: 'former images resource' },
  { path: '/favicon.svg',         desc: 'former branding resource' },
  { path: '/favicon.ico',         desc: 'former branding resource' },
  { path: '/logo.svg',            desc: 'former branding resource' },
  { path: '/logo-dark.svg',       desc: 'former branding resource' },
  { path: '/logo-large.svg',      desc: 'former branding resource' },
  { path: '/logo-large-dark.svg', desc: 'former branding resource' },
  { path: '/apple-touch-icon.png', desc: 'former branding resource' },
  { path: '/webmention',          desc: 'former webmention resource' },
  { path: '/api/rum/intake/rum/v1/default/rum', desc: 'former RUM intake resource' },
  { path: '/assets/main.js',      desc: 'dead assets prefix' },
  { path: '/build/client.js',     desc: 'dead build prefix' },
  { path: '/__manifest',          desc: 'dead manifest prefix' },
]

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

afterEach(async () => {
  await clearAllTables(db)
})

describe('honoInstallGateMiddleware', () => {
  async function makeApp() {
    const { honoInstallGateMiddleware } = await import('@kobato/server/http/middlewares/install-gate')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        url: normalizeDocumentUrl(new URL(c.req.url)),
        db,
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.use(honoInstallGateMiddleware)
    app.all('*', (c) => c.json({ ok: true }))
    return app
  }

  async function seedAdmin(): Promise<void> {
    const hashed = await bcrypt.hash('Password123!', 12)
    await sqliteOf(db)
      .insert(user)
      .values({ name: 'Admin', email: 'admin@example.com', password: hashed, role: 'admin' })
  }

  describe('exempt paths (noAdmin → passes through)', () => {
    for (const { path, desc } of EXEMPT_CASES) {
      it(`allows ${desc}: ${path}`, async () => {
        const app = await makeApp()
        const res = await app.request(path)
        expect(res.status).not.toBe(302)
        expect(res.headers.get('location')).not.toBe('/admin/setup')
      })
    }
  })

  describe('blocked paths (noAdmin → redirect)', () => {
    for (const { path, desc } of BLOCKED_CASES) {
      it(`redirects ${desc}: ${path}`, async () => {
        const app = await makeApp()
        const res = await app.request(path)
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/setup')
      })
    }
  })

  describe('installed state', () => {
    it('allows all paths when installed', async () => {
      await seedAdmin()
      const app = await makeApp()
      const res = await app.request('/posts/hello')
      expect(res.status).toBe(200)
      const admins = await sqliteOf(db).select().from(user).where(eq(user.role, 'admin'))
      expect(admins.length).toBe(1)
    })
  })
})
