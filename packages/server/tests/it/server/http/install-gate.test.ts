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
  { path: '/assets/main.js',         desc: 'assets prefix' },
  { path: '/build/client.js',        desc: 'build prefix' },
  { path: '/fonts/Inter.woff2',      desc: 'fonts prefix' },
  { path: '/images/avatar/1.png',    desc: 'images prefix' },
  { path: '/favicon.svg',            desc: 'favicon svg' },
  { path: '/favicon.ico',            desc: 'favicon ico' },
  { path: '/logo.svg',               desc: 'logo svg' },
  { path: '/logo-dark.svg',          desc: 'logo-dark svg' },
  { path: '/logo-large.svg',         desc: 'logo-large svg' },
  { path: '/logo-large-dark.svg',    desc: 'logo-large-dark svg' },
  { path: '/apple-touch-icon.png',   desc: 'apple-touch-icon' },
  { path: '/robots.txt',             desc: 'robots.txt' },
  { path: '/sitemap.xml',            desc: 'sitemap.xml' },
  { path: '/__manifest',             desc: '__manifest' },
  { path: '/admin/signin',           desc: 'admin signin' },
  { path: '/admin/setup',            desc: 'admin setup' },
  { path: '/api/setup/restore',      desc: 'api setup restore' },
  { path: '/ready',                  desc: 'ready endpoint' },
  { path: '/api/rum/status',         desc: 'frontend RUM status probe' },
  { path: '/api/rum/intake/rum/v1/default/rum', desc: 'frontend RUM intake relay' },
  { path: '/admin/signin.data',      desc: 'RR data suffix' },
]

// oxfmt-ignore
const BLOCKED_CASES = [
  { path: '/',                       desc: 'root path' },
  { path: '/posts/hello',            desc: 'public post' },
  { path: '/about',                  desc: 'page route' },
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
