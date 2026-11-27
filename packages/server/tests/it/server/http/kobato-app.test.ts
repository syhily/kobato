import { sqliteOf } from '@kobato/db/sqlite/database'
import { user } from '@kobato/db/sqlite/schema/user'
import { createKobatoApp } from '@kobato/server/http/kobato-app'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SHELL_HTML = '<html><head><script>void 0</script></head><body><div id="root"></div></body></html>'
const ASSET_NAME = 'entry-abc123.js'

const assetsRoot = mkdtempSync(join(tmpdir(), 'kobato-app-'))
writeFileSync(join(assetsRoot, 'index.html'), SHELL_HTML)
mkdirSync(join(assetsRoot, 'assets'))
writeFileSync(join(assetsRoot, 'assets', ASSET_NAME), 'export const ready = true')

const app = createKobatoApp(assetsRoot)

const db = getTestDb()

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(() => {
  rmSync(assetsRoot, { recursive: true, force: true })
})

function nonceFromCsp(csp: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(csp ?? '')?.[1]
}

describe('createKobatoApp', () => {
  beforeEach(async () => {
    vi.stubEnv('DEV', false as never)
    await clearAllTables(db)
    await sqliteOf(db).insert(user).values({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'not-a-real-hash',
      role: 'admin',
    })
  })

  it('serves a workspace asset from the client build directory with the one-year cache header', async () => {
    const res = await app.request(`/admin/assets/${ASSET_NAME}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000')
    expect(await res.text()).toBe('export const ready = true')
  })

  it('answers 404 for a missing asset', async () => {
    const res = await app.request('/admin/assets/missing.js')
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBeNull()
  })

  it('answers document requests through the shell with a matching nonce', async () => {
    for (const path of ['/admin/signin', '/admin', '/editor/post/new']) {
      const res = await app.request(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('Content-Type'), path).toBe('text/html; charset=utf-8')
      expect(res.headers.get('Cache-Control'), path).toBe('no-store')
      const nonce = nonceFromCsp(res.headers.get('Content-Security-Policy'))
      expect(nonce, path).toBeDefined()
      expect(await res.text(), path).toBe(SHELL_HTML.replace('<script>', `<script nonce="${nonce}">`))
    }
  })

  it('answers 404 for every non-document, non-asset URL', async () => {
    for (const path of ['/', '/archives', '/assets/x.js']) {
      const res = await app.request(path)
      expect(res.status, path).toBe(404)
    }
  })

  it('answers 404 for a POST to a document path', async () => {
    const res = await app.request('/admin/signin', { method: 'POST' })
    expect(res.status).toBe(404)
  })
})
