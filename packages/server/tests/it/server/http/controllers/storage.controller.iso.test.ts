import type { StorageObjectInput } from '@kobato/api/contracts/public/storage'

import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const { storageRouter } = await import('@kobato/server/http/controllers/public/storage.controller')
const { __setStorageDirForTests } = await import('@kobato/server/infra/data-paths')
const { RESOURCE_STREAM_HEADER } = await import('@kobato/api/client/resource-stream')

const db = getTestDb()

const root = mkdtempSync(join(tmpdir(), 'storage-procedure-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/images`, { recursive: true })
  mkdirSync(`${root}/musics`, { recursive: true })
  mkdirSync(`${root}/branding`, { recursive: true })
  mkdirSync(`${root}/backup`, { recursive: true })
  mkdirSync(`${root}/private`, { recursive: true })
  writeFileSync(`${root}/images/a.jpg`, 'img')
  writeFileSync(`${root}/musics/b.mp3`, 'aud')
  writeFileSync(`${root}/musics/t.flac`, 'flac')
  writeFileSync(`${root}/branding/c.svg`, '<svg/>')
  writeFileSync(`${root}/backup/backup-2026-01-01T00-00-00.sql.gz`, 'dump')
  writeFileSync(`${root}/private/secret.txt`, 'shh')
  writeFileSync(`${root}/.env`, 'SECRET=1')
  writeFileSync(`${root}/images/.hidden`, 'hid')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

const callObject = (input: StorageObjectInput) => call(storageRouter.object, input, { context: makePublicCtx({ db }) })

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

describe('storageRouter.object (local driver)', () => {
  beforeEach(() => {
    seedStorageEnabled(false)
  })

  it('streams the allowlisted public namespaces with their content types', async () => {
    for (const [path, contentType] of [
      ['/storage/images/a.jpg', 'image/jpeg'],
      ['/storage/musics/b.mp3', 'audio/mpeg'],
      ['/storage/branding/c.svg', 'image/svg+xml'],
      ['/storage/musics/t.flac', 'audio/flac'],
    ] as const) {
      const ctx = makePublicCtx({ db })
      const answer = await call(storageRouter.object, { path }, { context: ctx })
      expect(answer).toBeInstanceOf(ReadableStream)
      expect(unsafeCtxHeader(ctx, RESOURCE_STREAM_HEADER)).toBe('200')
      expect(unsafeCtxHeader(ctx, 'Content-Type')).toBe(contentType)
      expect(unsafeCtxHeader(ctx, 'Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
      expect(unsafeCtxHeader(ctx, 'Accept-Ranges')).toBe('bytes')
      expect(unsafeCtxHeader(ctx, 'X-Content-Type-Options')).toBe('nosniff')
      expect(unsafeCtxHeader(ctx, 'ETag')).toMatch(/^"\d+-\d+"$/)
    }
  })

  it('pipes the stored bytes through the stream answer', async () => {
    const answer = (await callObject({ path: '/storage/images/a.jpg' })) as ReadableStream<Uint8Array>
    const chunks: string[] = []
    for await (const chunk of answer) {
      chunks.push(new TextDecoder().decode(chunk))
    }
    expect(chunks.join('')).toBe('img')
  })

  it('answers a 206 slice with Content-Range for a valid single range', async () => {
    const ctx = makePublicCtx({ db })
    const answer = await call(
      storageRouter.object,
      { path: '/storage/musics/b.mp3', range: 'bytes=0-1' },
      { context: ctx },
    )
    expect(answer).toBeInstanceOf(ReadableStream)
    expect(unsafeCtxHeader(ctx, RESOURCE_STREAM_HEADER)).toBe('206')
    expect(unsafeCtxHeader(ctx, 'Content-Range')).toBe('bytes 0-1/3')
    expect(unsafeCtxHeader(ctx, 'Content-Length')).toBe('2')
  })

  it('answers not-modified for a matching etag and range-not-satisfiable with bytes */size', async () => {
    const ctx = makePublicCtx({ db })
    await call(storageRouter.object, { path: '/storage/musics/b.mp3' }, { context: ctx })
    const etag = unsafeCtxHeader(ctx, 'ETag')!
    const cached = await call(
      storageRouter.object,
      { path: '/storage/musics/b.mp3', ifNoneMatch: etag },
      { context: ctx },
    )
    expect(cached).toMatchObject({ kind: 'not-modified', etag, contentLanguage: null })
    const unsatisfiable = await callObject({ path: '/storage/musics/b.mp3', range: 'bytes=999-' })
    expect(unsatisfiable).toMatchObject({ kind: 'range-not-satisfiable', contentRange: 'bytes */3' })
  })

  it('refuses to serve a database backup, private namespaces, dotfiles, and unknown namespaces (P0)', async () => {
    await expect(callObject({ path: '/storage/backup/backup-2026-01-01T00-00-00.sql.gz' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(callObject({ path: '/storage/private/secret.txt' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/storage/.env' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/storage/images/.hidden' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/storage/unknown/x.txt' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/storage/images/a.jpg/../b.mp3' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/storage/images/' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers NOT_FOUND for a path outside the storage route', async () => {
    await expect(callObject({ path: '/fonts/embedded/escape' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(callObject({ path: '/etc/passwd' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers BAD_REQUEST for an undecodable key', async () => {
    await expect(callObject({ path: '/storage/%zz' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('answers NOT_FOUND for a well-formed key with no object on disk', async () => {
    await expect(callObject({ path: '/storage/images/missing.jpg' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('storageRouter.object (s3 primary)', () => {
  beforeEach(() => {
    seedStorageEnabled(true)
  })

  it('302s an allowlisted key to the current public base, preserving the query string', async () => {
    const answer = await call(
      storageRouter.object,
      { path: '/storage/images/a.jpg', search: '?v=123' },
      { context: makePublicCtx({ db }) },
    )
    expect(answer).toEqual({
      kind: 'redirect',
      location: 'https://assets.example.com/images/a.jpg?v=123',
      cacheControl: 'public, max-age=300',
    })
  })

  it('keeps the namespace allowlist ahead of the redirect (private keys 404, never redirect)', async () => {
    await expect(
      call(
        storageRouter.object,
        { path: '/storage/backup/backup-2026-01-01T00-00-00.sql.gz', search: '?v=1' },
        { context: makePublicCtx({ db }) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('applies the CDN transform template when w and h are present', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        asset: { scheme: 'https', host: 'assets.example.com' },
        storage: {
          ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage,
          enabled: true,
          urlTemplate: 'https://cdn.example.com/{width}x{height}/q{quality}/{src}',
        },
      },
    })
    const answer = await call(
      storageRouter.object,
      { path: '/storage/images/a.jpg', search: '?w=320&h=240&q=75' },
      { context: makePublicCtx({ db }) },
    )
    expect(answer).toMatchObject({
      kind: 'redirect',
      location: 'https://cdn.example.com/320x240/q75/https://assets.example.com/images/a.jpg',
      cacheControl: 'public, max-age=300',
    })
  })

  it('follows asset host updates immediately', async () => {
    seedStorageEnabled(true, 'cdn2.example.com')
    const answer = await callObject({ path: '/storage/musics/b.mp3' })
    expect(answer).toMatchObject({ kind: 'redirect', location: 'https://cdn2.example.com/musics/b.mp3' })
  })

  it('answers SERVICE_UNAVAILABLE when S3 is active but the public base is unconfigured', async () => {
    seedStorageEnabled(true, '')
    await expect(callObject({ path: '/storage/images/a.jpg' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })
})

function unsafeCtxHeader(ctx: unknown, name: string): string | null {
  const headers = (ctx as { responseHeaders: Headers }).responseHeaders
  return headers.get(name)
}
