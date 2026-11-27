import type { EmbeddedFontInput } from '@kobato/api/contracts/public/fonts'

import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { fontsRouter } = await import('@kobato/server/http/controllers/public/fonts.controller')
const { __setStorageDirForTests } = await import('@kobato/server/infra/data-paths')
const { RESOURCE_STREAM_HEADER } = await import('@kobato/api/client/resource-stream')

const db = getTestDb()

const HASH = 'a'.repeat(64)
const MISSING_HASH = 'b'.repeat(64)

const root = mkdtempSync(join(tmpdir(), 'fonts-embedded-procedure-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/fonts/${HASH}`, { recursive: true })
  writeFileSync(`${root}/fonts/${HASH}/result.css`, '@font-face{}')
  writeFileSync(`${root}/fonts/${HASH}/chunk-001.woff2`, 'woff2-bytes')
  writeFileSync(`${root}/fonts/${HASH}/.secret.woff2`, 'hid')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

const callEmbedded = (input: EmbeddedFontInput) => call(fontsRouter.embedded, input, { context: makePublicCtx({ db }) })

function seedStorageEnabled(enabled: boolean, assetHost = 'assets.example.com') {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: {
      ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
      asset: { scheme: 'https', host: assetHost },
      storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled },
    },
  })
}

describe('fontsRouter.embedded (local driver)', () => {
  beforeEach(() => {
    seedStorageEnabled(false)
  })

  it('answers a full immutable stream with the font content type and validators on the transport headers', async () => {
    const answer = (await callEmbedded({
      path: `/fonts/embedded/${HASH}/chunk-001.woff2`,
    })) as ReadableStream<Uint8Array>
    expect(answer).toBeInstanceOf(ReadableStream)
    const ctx = makePublicCtx({ db })
    await call(fontsRouter.embedded, { path: `/fonts/embedded/${HASH}/chunk-001.woff2` }, { context: ctx })
    const marker = unsafeCtxHeader(ctx, RESOURCE_STREAM_HEADER)
    expect(marker).toBe('200')
    expect(unsafeCtxHeader(ctx, 'Content-Type')).toBe('font/woff2')
    expect(unsafeCtxHeader(ctx, 'Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(unsafeCtxHeader(ctx, 'Accept-Ranges')).toBe('bytes')
    expect(unsafeCtxHeader(ctx, 'X-Content-Type-Options')).toBe('nosniff')
    expect(unsafeCtxHeader(ctx, 'ETag')).toMatch(/^"\d+-\d+"$/)
    expect(unsafeCtxHeader(ctx, 'Content-Length')).toBe('11')
  })

  it('pipes the actual bytes through the stream answer', async () => {
    const answer = (await callEmbedded({ path: `/fonts/embedded/${HASH}/result.css` })) as ReadableStream<Uint8Array>
    const chunks: string[] = []
    for await (const chunk of answer) {
      chunks.push(new TextDecoder().decode(chunk))
    }
    expect(chunks.join('')).toBe('@font-face{}')
  })

  it('answers a 206 slice via the transport headers for a valid single range', async () => {
    const ctx = makePublicCtx({ db })
    const answer = await call(
      fontsRouter.embedded,
      { path: `/fonts/embedded/${HASH}/chunk-001.woff2`, range: 'bytes=0-4' },
      { context: ctx },
    )
    expect(answer).toBeInstanceOf(ReadableStream)
    expect(unsafeCtxHeader(ctx, RESOURCE_STREAM_HEADER)).toBe('206')
    expect(unsafeCtxHeader(ctx, 'Content-Range')).toBe('bytes 0-4/11')
    expect(unsafeCtxHeader(ctx, 'Content-Length')).toBe('5')
  })

  it('answers not-modified for an exact etag or wildcard match', async () => {
    const ctx = makePublicCtx({ db })
    await call(fontsRouter.embedded, { path: `/fonts/embedded/${HASH}/chunk-001.woff2` }, { context: ctx })
    const etag = unsafeCtxHeader(ctx, 'ETag')!
    const cached = await call(
      fontsRouter.embedded,
      { path: `/fonts/embedded/${HASH}/chunk-001.woff2`, ifNoneMatch: etag },
      { context: ctx },
    )
    expect(cached).toMatchObject({
      kind: 'not-modified',
      etag,
      contentType: 'font/woff2',
      cacheControl: 'public, max-age=31536000, immutable, no-transform',
      contentLanguage: null,
    })
    const wildcard = await call(
      fontsRouter.embedded,
      { path: `/fonts/embedded/${HASH}/chunk-001.woff2`, ifNoneMatch: '*' },
      { context: makePublicCtx({ db }) },
    )
    expect(wildcard).toMatchObject({ kind: 'not-modified' })
    const stale = await call(
      fontsRouter.embedded,
      { path: `/fonts/embedded/${HASH}/chunk-001.woff2`, ifNoneMatch: '"0-0"' },
      { context: makePublicCtx({ db }) },
    )
    expect(stale).toBeInstanceOf(ReadableStream)
  })

  it('answers range-not-satisfiable with bytes */size', async () => {
    const answer = await callEmbedded({ path: `/fonts/embedded/${HASH}/chunk-001.woff2`, range: 'bytes=99999-' })
    expect(answer).toMatchObject({
      kind: 'range-not-satisfiable',
      contentRange: 'bytes */11',
      contentType: 'font/woff2',
      cacheControl: 'public, max-age=31536000, immutable, no-transform',
      contentLanguage: null,
    })
  })

  it('answers BAD_REQUEST for keys outside the embedded-font route grammar', async () => {
    await expect(callEmbedded({ path: '/fonts/embedded/abc123/result.css' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(callEmbedded({ path: `/fonts/embedded/${'A'.repeat(64)}/result.css` })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(callEmbedded({ path: `/fonts/embedded/${HASH}/.secret.woff2` })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(callEmbedded({ path: `/fonts/embedded/${HASH}/../escape.woff2` })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(callEmbedded({ path: '/storage/images/escape.jpg' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('answers NOT_FOUND for a well-formed hash with no package on disk', async () => {
    await expect(callEmbedded({ path: `/fonts/embedded/${MISSING_HASH}/result.css` })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('fontsRouter.embedded (s3 primary)', () => {
  beforeEach(() => {
    seedStorageEnabled(true)
  })

  it('answers the redirect envelope to the raw storage key, preserving the query', async () => {
    const answer = await call(
      fontsRouter.embedded,
      { path: `/fonts/embedded/${HASH}/result.css`, search: '?v=3735928559' },
      { context: makePublicCtx({ db }) },
    )
    expect(answer).toEqual({
      kind: 'redirect',
      location: `https://assets.example.com/fonts/${HASH}/result.css?v=3735928559`,
      cacheControl: 'public, max-age=300',
    })
  })

  it('keeps the path-shape gate ahead of the redirect (malformed paths 400, never redirect)', async () => {
    await expect(callEmbedded({ path: '/fonts/embedded/abc123/result.css' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('answers SERVICE_UNAVAILABLE when S3 is active but the public base is unconfigured', async () => {
    seedStorageEnabled(true, '')
    await expect(callEmbedded({ path: `/fonts/embedded/${HASH}/result.css` })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  })
})

function unsafeCtxHeader(ctx: unknown, name: string): string | null {
  const headers = (ctx as { responseHeaders: Headers }).responseHeaders
  return headers.get(name)
}
