import { describe, expect, it } from 'vitest'

import { projectAssetsForAdmin, projectSearchForAdmin } from '@/shared/config/projection'

describe('shared/config/projection — projectAssetsForAdmin', () => {
  const baseInput = {
    asset: { host: 'cdn.example.com', scheme: 'https' as const },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'kobato',
      accessKeyId: 'AKIATEST',
      secretAccessKey: '0123456789abcdef',
      forcePathStyle: true,
      urlTemplate: 'https://cdn.example.com/{key}',
    },
    upload: { maxBytes: 1024, jpegQuality: 90 },
    branding: {
      faviconSvg: { etag: 'svg-1' },
      faviconIco: { etag: 'ico-1' },
      appleTouchIcon: undefined,
      icon192: undefined,
      icon512: { etag: '' },
      logoSvg: { etag: 'logo' },
      logoDarkSvg: undefined,
      logoLargeSvg: undefined,
      logoLargeDarkSvg: undefined,
      openGraph: { etag: 'og-1' },
      blogPoster: { etag: 'poster' },
      blogPosterDark: undefined,
      defaultAvatar: undefined,
      robotsTxt: 'User-agent: *\nDisallow: /admin',
    },
  }

  it('returns the asset host/scheme verbatim', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.asset).toEqual({ host: 'cdn.example.com', scheme: 'https' })
  })

  it('passes through configured storage fields', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.storage).toMatchObject({
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'kobato',
      accessKeyId: 'AKIATEST',
      forcePathStyle: true,
      urlTemplate: 'https://cdn.example.com/{key}',
    })
  })

  it('defaults storage booleans to false and strings to empty when undefined', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.storage.enabled).toBe(false)
    expect(out.storage.forcePathStyle).toBe(false)
    expect(out.storage.endpoint).toBe('')
    expect(out.storage.region).toBe('')
    expect(out.storage.bucket).toBe('')
    expect(out.storage.accessKeyId).toBe('')
    expect(out.storage.urlTemplate).toBe('')
  })

  it('masks the secret access key to the last 4 chars when no override is provided', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.secretAccessKeyMask).toBe('cdef')
  })

  it('returns null secret mask when secret is empty', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.secretAccessKeyMask).toBeNull()
  })

  it('uses the provided secret mask override', () => {
    const out = projectAssetsForAdmin(baseInput, 'wxyz')
    expect(out.secretAccessKeyMask).toBe('wxyz')
  })

  it('applies upload defaults when maxBytes/jpegQuality are missing', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.upload.maxBytes).toBe(8 * 1024 * 1024)
    expect(out.upload.jpegQuality).toBe(82)
  })

  it('projects branding refs into {etag} shape with empty string fallback', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.branding.faviconSvg).toEqual({ etag: 'svg-1' })
    expect(out.branding.faviconIco).toEqual({ etag: 'ico-1' })
    expect(out.branding.appleTouchIcon).toEqual({ etag: '' })
    expect(out.branding.icon192).toEqual({ etag: '' })
    expect(out.branding.icon512).toEqual({ etag: '' })
    expect(out.branding.openGraph).toEqual({ etag: 'og-1' })
  })

  it('passes robotsTxt through, defaulting to empty string when absent', () => {
    expect(projectAssetsForAdmin(baseInput).branding.robotsTxt).toContain('User-agent')
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.branding.robotsTxt).toBe('')
  })
})

describe('shared/config/projection — projectSearchForAdmin', () => {
  it('uses defaults when called with undefined', () => {
    const out = projectSearchForAdmin(undefined)
    expect(out.search.enabled).toBe(false)
    expect(out.search.mode).toBe('like')
    expect(out.search.model).toBe('text-embedding-3-small')
    expect(out.search.similarityThreshold).toBe(0.5)
    expect(out.search.endpoint).toBe('')
    expect(out.search.apiKey).toBe('')
    expect(out.apiKeyMask).toBeNull()
  })

  it('preserves enabled, mode, endpoint, model, similarityThreshold', () => {
    const out = projectSearchForAdmin({
      search: {
        enabled: true,
        mode: 'vector',
        endpoint: 'https://api.openai.com',
        apiKey: 'sk-abcdefgh',
        model: 'text-embedding-3-large',
        similarityThreshold: 0.75,
      },
    })
    expect(out.search.enabled).toBe(true)
    expect(out.search.mode).toBe('vector')
    expect(out.search.endpoint).toBe('https://api.openai.com')
    expect(out.search.model).toBe('text-embedding-3-large')
    expect(out.search.similarityThreshold).toBe(0.75)
  })

  it('never leaks the raw api key into the projected shape', () => {
    const out = projectSearchForAdmin({
      search: { enabled: true, mode: 'vector', apiKey: 'sk-abcdefghijkl' },
    })
    expect(out.search.apiKey).toBe('')
    expect(out.apiKeyMask).toBe('ijkl')
  })

  it('honours an explicit api key mask override', () => {
    const out = projectSearchForAdmin({ search: { apiKey: 'sk-abcdefghijkl' } }, 'xxxx')
    expect(out.apiKeyMask).toBe('xxxx')
  })

  it('coerces unknown modes to "like"', () => {
    const out = projectSearchForAdmin({
      // @ts-expect-error intentionally invalid mode
      search: { mode: 'bm25' },
    })
    expect(out.search.mode).toBe('like')
  })
})
