import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { font } from '@/server/infra/db/schema/font'

// Only findFontsByIds is spied (so the no-slot short-circuit is assertable); settings and the DB stay real.
vi.mock('@/server/domains/fonts/services/read', { spy: true })

const { findFontsByIds } = await import('@/server/domains/fonts/services/read')
const { resolveFontsForRender } = await import('@/server/domains/fonts/services/render')

const db = getTestDb()

const HASH = 'a'.repeat(64)
// NOT `fontCssKey(HASH)`: a mismatched cssKey proves render reads the persisted column.
const CSS_KEY = `fonts/${'c'.repeat(64)}/result.css`
// etagToTimestamp takes the first 8 hex chars: parseInt('deadbeef', 16).
const ETAG = `deadbeef${'0'.repeat(56)}`
const VERSION = 3735928559

async function seedFont(overrides: Partial<typeof font.$inferInsert> = {}) {
  const rows = await db
    .insert(font)
    .values({
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
    })
    .returning()
  return rows[0]!
}

// Only the three slot lists matter to the resolver.
function settings(global: string[], post: string[] = [], code: string[] = []) {
  return { og: { family: '' }, calendar: { family: '' }, global, post, code }
}

function seedSettings(website: string | null = 'https://site.example.com') {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    // Null website exercises the unconfigured path; the section type is string.
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: website as string },
    assets: {
      ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
      asset: { scheme: 'https', host: 'cdn.example.com' },
    },
  })
}

beforeEach(async () => {
  vi.mocked(findFontsByIds).mockClear()
  seedSettings()
  await clearAllTables(db)
})

describe('resolveFontsForRender — cssKey consumption', () => {
  it('builds the local href from the persisted cssKey via the embedded route', async () => {
    await seedFont()
    const resolved = await resolveFontsForRender(db, settings(['font-1']), false)
    expect(resolved.global).toEqual([
      {
        family: 'Test Serif',
        href: `https://site.example.com/fonts/embedded/${'c'.repeat(64)}/result.css?v=${VERSION}`,
      },
    ])
  })

  it('builds the same site-owned href for an s3 driver row (the route 302s to the backend)', async () => {
    await seedFont({ storageDriver: 's3' })
    const resolved = await resolveFontsForRender(db, settings(['font-1']), false)
    expect(resolved.global).toEqual([
      {
        family: 'Test Serif',
        href: `https://site.example.com/fonts/embedded/${'c'.repeat(64)}/result.css?v=${VERSION}`,
      },
    ])
  })

  it('degrades to an empty href when the URL base is unconfigured', async () => {
    seedSettings('')
    await seedFont()
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
    const resolved = await resolveFontsForRender(db, settings(['gone']), false)
    expect(resolved.global).toEqual([])
  })

  it('resolves post/code slots only when wantsPostFonts is set', async () => {
    await seedFont()
    const off = await resolveFontsForRender(db, settings([], ['font-1'], ['font-1']), false)
    expect(off.post).toEqual([])
    expect(off.code).toEqual([])
    const on = await resolveFontsForRender(db, settings([], ['font-1']), true)
    expect(on.post).toHaveLength(1)
  })
})
