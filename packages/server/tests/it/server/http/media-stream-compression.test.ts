import type { ServerType } from '@hono/node-server'
import type { Env } from '@kobato/server/http/hono-env'

import { serve } from '@hono/node-server'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { user as userTable } from '@kobato/db/sqlite/schema/user'
import { configureMiddleware } from '@kobato/server/http/middleware-pipeline'
import { __setStorageDirForTests } from '@kobato/server/infra/data-paths'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { resetBlogSettingsForTests } from '@kobato/settings/tests/utils/blog-settings'
import { Hono } from 'hono'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const SVG_BODY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${'<rect width="8" height="8" fill="#0366d6"/><rect width="7" height="7" x="0.5" y="0.5" fill="#f9826c"/>'.repeat(40)}</svg>`
const SVG_BYTES = new TextEncoder().encode(SVG_BODY)
const FONT_HASH = 'a'.repeat(64)
const FONT_BYTES = new Uint8Array(2048).map((_, index) => index & 0xff)

const root = mkdtempSync(join(tmpdir(), 'media-stream-compression-'))
__setStorageDirForTests(root)

let server: ServerType
let rpcUrl: string

beforeAll(async () => {
  mkdirSync(join(root, 'branding'), { recursive: true })
  mkdirSync(join(root, 'fonts', FONT_HASH), { recursive: true })
  writeFileSync(join(root, 'branding', 'smoke.svg'), SVG_BODY)
  writeFileSync(join(root, 'fonts', FONT_HASH, 'regular.ttf'), FONT_BYTES)
  const app = new Hono<Env>()
  configureMiddleware(app)
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1', overrideGlobalObjects: false }, (info) =>
      resolve(info.port),
    )
  })
  rpcUrl = `http://127.0.0.1:${port}/rpc`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
  await sqliteOf(db).insert(userTable).values({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
})

async function postProcedure(path: string, input: Record<string, unknown>): Promise<Response> {
  return fetch(`${rpcUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(10_000),
  })
}

async function jsonAnswer(response: Response): Promise<{ json: Record<string, unknown> }> {
  return (await response.json()) as { json: Record<string, unknown> }
}

describe('media stream answers over the real compressed perimeter', () => {
  it('serves a compressible ≥1 KiB storage svg uncompressed with a strong etag and exact revalidation', async () => {
    expect(SVG_BYTES.byteLength).toBeGreaterThanOrEqual(1024)
    const res = await postProcedure('/public/storage/object', { path: '/storage/branding/smoke.svg' })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable, no-transform')
    const etag = res.headers.get('etag')
    expect(etag).toMatch(/^"\d+-\d+"$/)
    expect(res.headers.get('content-length')).toBe(String(SVG_BYTES.byteLength))
    const body = new Uint8Array(await res.arrayBuffer())
    expect(body.byteLength).toBe(SVG_BYTES.byteLength)
    expect(Buffer.compare(Buffer.from(body), Buffer.from(SVG_BYTES))).toBe(0)

    const conditional = await postProcedure('/public/storage/object', {
      path: '/storage/branding/smoke.svg',
      ifNoneMatch: etag ?? '',
    })
    expect(conditional.status).toBe(200)
    expect((await jsonAnswer(conditional)).json).toMatchObject({ kind: 'not-modified', etag })
  })

  it('serves a compressible ≥1 KiB embedded ttf uncompressed with a strong etag and exact revalidation', async () => {
    expect(FONT_BYTES.byteLength).toBeGreaterThanOrEqual(1024)
    const path = `/fonts/embedded/${FONT_HASH}/regular.ttf`
    const res = await postProcedure('/public/fonts/embedded', { path })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-type')).toBe('font/ttf')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable, no-transform')
    const etag = res.headers.get('etag')
    expect(etag).toMatch(/^"\d+-\d+"$/)
    expect(res.headers.get('content-length')).toBe(String(FONT_BYTES.byteLength))
    const body = new Uint8Array(await res.arrayBuffer())
    expect(body.byteLength).toBe(FONT_BYTES.byteLength)
    expect(Buffer.compare(Buffer.from(body), Buffer.from(FONT_BYTES))).toBe(0)

    const conditional = await postProcedure('/public/fonts/embedded', { path, ifNoneMatch: etag ?? '' })
    expect(conditional.status).toBe(200)
    expect((await jsonAnswer(conditional)).json).toMatchObject({ kind: 'not-modified', etag })
  })
})
