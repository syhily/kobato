import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FontRow } from '@/server/infra/db/schema/font'

// `resolveAssetUrl` reads the CDN host + site origin off the settings
// bundle via `requireBlogSettingsSection` — stub the getter so each test
// controls the two sections it cares about (same pattern as the
// public-url suite). `findFontsByIds` is the DB boundary: stub it and keep
// the pure `resolveSlotOrder` real.
vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((_section: string): unknown => ({})),
}))

vi.mock('@/server/domains/fonts/services/read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/fonts/services/read')>()
  return { ...actual, findFontsByIds: vi.fn() }
})

const { requireBlogSettingsSection } = (await import('@/shared/config/getters')) as unknown as {
  requireBlogSettingsSection: ReturnType<typeof vi.fn>
}
const { findFontsByIds } = (await import('@/server/domains/fonts/services/read')) as unknown as {
  findFontsByIds: ReturnType<typeof vi.fn>
}
const { resolveFontsForRender } = await import('@/server/domains/fonts/services/render')

const db = {} as Parameters<typeof resolveFontsForRender>[0]

const HASH = 'a'.repeat(64)
// Deliberately NOT `fontCssKey(HASH)` — a cssKey pointing at a different
// package proves render consumes the persisted column instead of
// recomputing the `fonts/<hash>/result.css` layout from the row's hash.
const CSS_KEY = `fonts/${'c'.repeat(64)}/result.css`
// etagToTimestamp takes the first 8 hex chars: parseInt('deadbeef', 16).
const ETAG = `deadbeef${'0'.repeat(56)}`
const VERSION = 3735928559

function fontRow(overrides: Partial<FontRow> = {}): FontRow {
  return {
    id: 'font-1',
    familyName: 'Test Serif',
    sourceName: 'test-serif.ttf',
    hash: HASH,
    cssKey: CSS_KEY,
    storageDriver: 'local',
    chunkCount: 3,
    totalBytes: 1024,
    etag: ETAG,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

// Full FontsSettings shape; only the three slot lists matter to the resolver.
function settings(global: string[], post: string[] = [], code: string[] = []) {
  return { og: { family: '' }, calendar: { family: '' }, global, post, code }
}

beforeEach(() => {
  findFontsByIds.mockReset()
  requireBlogSettingsSection.mockImplementation((section: string) => {
    if (section === 'assets') {
      return { asset: { scheme: 'https', host: 'cdn.example.com' } }
    }
    if (section === 'siteIdentity') {
      return { website: 'https://site.example.com' }
    }
    return {}
  })
})

describe('resolveFontsForRender — cssKey consumption', () => {
  it('builds the local href from the persisted cssKey via the embedded route', async () => {
    findFontsByIds.mockResolvedValue(new Map([['font-1', fontRow()]]))
    const resolved = await resolveFontsForRender(db, settings(['font-1']), false)
    expect(resolved.global).toEqual([
      {
        family: 'Test Serif',
        href: `https://site.example.com/fonts/embedded/${'c'.repeat(64)}/result.css?v=${VERSION}`,
      },
    ])
  })

  it('builds the s3 href from the persisted cssKey on the raw storage key', async () => {
    findFontsByIds.mockResolvedValue(new Map([['font-1', fontRow({ storageDriver: 's3' })]]))
    const resolved = await resolveFontsForRender(db, settings(['font-1']), false)
    expect(resolved.global).toEqual([{ family: 'Test Serif', href: `https://cdn.example.com/${CSS_KEY}?v=${VERSION}` }])
  })

  it('degrades to an empty href when the URL base is unconfigured', async () => {
    requireBlogSettingsSection.mockImplementation(() => ({ website: '' }))
    findFontsByIds.mockResolvedValue(new Map([['font-1', fontRow()]]))
    const resolved = await resolveFontsForRender(db, settings(['font-1']), false)
    expect(resolved.global).toEqual([{ family: 'Test Serif', href: '' }])
  })
})

describe('resolveFontsForRender — slot resolution', () => {
  it('returns EMPTY without touching the db when no slot references a font', async () => {
    const resolved = await resolveFontsForRender(db, settings([]), true)
    expect(resolved).toEqual({ global: [], post: [], code: [] })
    expect(findFontsByIds).not.toHaveBeenCalled()
  })

  it('drops stale ids that no longer resolve to a row', async () => {
    findFontsByIds.mockResolvedValue(new Map())
    const resolved = await resolveFontsForRender(db, settings(['gone']), false)
    expect(resolved.global).toEqual([])
  })

  it('resolves post/code slots only when wantsPostFonts is set', async () => {
    const row = fontRow()
    findFontsByIds.mockResolvedValue(new Map([['font-1', row]]))
    const off = await resolveFontsForRender(db, settings([], ['font-1'], ['font-1']), false)
    expect(off.post).toEqual([])
    expect(off.code).toEqual([])
    const on = await resolveFontsForRender(db, settings([], ['font-1']), true)
    expect(on.post).toHaveLength(1)
  })
})
