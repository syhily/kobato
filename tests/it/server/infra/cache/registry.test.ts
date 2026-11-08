import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  __resetCacheCountersForTests,
  bumpCounter,
  clear,
  clearLocalizedOutputs,
  get,
  getCounter,
  remove,
  resolveCacheSlot,
  through,
  throughMany,
} from '@/server/infra/cache/registry'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'
import { APP_VERSION } from '@/shared/config/version'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  __resetCacheCountersForTests()
})

async function findRow(key: string) {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, key)).limit(1)
  return rows[0] ?? null
}

/** A feed-relevant settings change: content.feed is in the feed scope's deps. */
function withChangedFeedSettings() {
  const content = TEST_BLOG_SETTINGS_BUNDLE.content!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    content: { ...content, feed: { full: !content.feed.full, size: content.feed.size + 1 } },
  }
}

/** An UNRELATED settings change: security is not rendered by any scope. */
function withChangedSecuritySettings() {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: {
      ...TEST_BLOG_SETTINGS_BUNDLE.security!,
      csrf: { ...TEST_BLOG_SETTINGS_BUNDLE.security!.csrf, enabled: false },
    },
  }
}

/** Feed params for the CURRENT content-addressed feed generation. */
function feedParams(overrides: { scope?: string; locale?: AppLocale; settingsRevision?: string } = {}) {
  return {
    scope: overrides.scope ?? 'all',
    locale: overrides.locale ?? ('zh-CN' as const),
    version: APP_VERSION,
    settingsRevision: overrides.settingsRevision ?? representationRevisionsFor(getBlogSettingsBundleSync()).feed,
  }
}

function feedKey(params: ReturnType<typeof feedParams>): string {
  return `${resolveCacheSlot('feed').prefix}${params.locale}:${params.version}:${params.settingsRevision}:${params.scope}`
}

describe('cache registry (integration)', () => {
  it('through round-trips a json entry: miss → loader, then hit', async () => {
    const loader = vi.fn().mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    const params = feedParams()

    const first = await through(db, 'feed', params, loader)
    const second = await through(db, 'feed', params, loader)

    expect(first).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(second).toEqual(first)
    expect(loader).toHaveBeenCalledTimes(1)

    const row = await findRow(feedKey(params))
    expect(row?.bucket).toBe('feed')
    expect(row?.expiresAt).not.toBeNull()
  })

  it('throughMany serves hits, loads misses, and caches negatives', async () => {
    const loader = vi.fn().mockResolvedValue([
      {
        params: { storagePath: 'a.png' },
        value: {
          found: true,
          storagePath: 'a.png',
          driver: 'local',
          width: 10,
          height: 20,
          thumbhash: null,
          updatedAtMs: 1,
        },
      },
      { params: { storagePath: 'b.png' }, value: { found: false } },
    ])

    const first = await throughMany(db, 'imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)
    expect(first[0]?.value).toMatchObject({ found: true, width: 10 })
    expect(first[1]?.value).toEqual({ found: false })

    // Second pass: both entries are cached, the negative included.
    const second = await throughMany(db, 'imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)
    expect(second[1]?.value).toEqual({ found: false })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clear deletes only the targeted bucket', async () => {
    await through(db, 'feed', feedParams(), async () => 'feed-xml')
    await through(db, 'tags', {}, async () => ['tag'])

    await clear(db, 'feed')

    expect(await findRow(feedKey(feedParams()))).toBeNull()
    expect(await findRow('tags:all')).not.toBeNull()
  })

  it('a feed-relevant settings write moves the key — the previous generation is unreachable', async () => {
    const before = feedParams()
    await through(db, 'feed', before, async () => ({ rss: '<old/>', atom: '<old/>' }))

    setBlogSettingsBundleForTests(withChangedFeedSettings())
    const after = feedParams()
    expect(after.settingsRevision).not.toBe(before.settingsRevision)

    expect(await get(db, 'feed', after)).toBeNull()
    const loader = vi.fn().mockResolvedValue({ rss: '<new/>', atom: '<new/>' })
    expect(await through(db, 'feed', after, loader)).toEqual({ rss: '<new/>', atom: '<new/>' })
    expect(loader).toHaveBeenCalledTimes(1)

    // The old generation's bytes are still on disk (TTL reaps them) but no
    // request can address them any more.
    expect(await get(db, 'feed', before)).toEqual({ rss: '<old/>', atom: '<old/>' })
  })

  it('an UNRELATED settings write keeps the key — no needless invalidation', async () => {
    const params = feedParams()
    const loader = vi.fn().mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    await through(db, 'feed', params, loader)

    // security is not in the feed scope's dependency list.
    setBlogSettingsBundleForTests(withChangedSecuritySettings())
    expect(feedParams().settingsRevision).toBe(params.settingsRevision)

    const again = await through(db, 'feed', params, loader)
    expect(again).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('an in-flight render started before a save writes only its old revision key', async () => {
    const before = feedParams()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = through(db, 'feed', before, async () => {
      await gate
      return { rss: '<stale/>', atom: '<stale/>' }
    })

    // A feed-relevant settings save lands while the render is still running; a
    // new request now addresses the new generation.
    setBlogSettingsBundleForTests(withChangedFeedSettings())
    const after = feedParams()
    const fresh = await through(db, 'feed', after, async () => ({ rss: '<fresh/>', atom: '<fresh/>' }))
    expect(fresh).toEqual({ rss: '<fresh/>', atom: '<fresh/>' })

    // Storage reclamation runs immediately — no drain, no wait.
    clearLocalizedOutputs(db)

    release()
    await pending

    // The late write lands on the OLD key only; the new generation stays empty
    // rather than being polluted by the stale render.
    expect(await findRow(feedKey(before))).not.toBeNull()
    expect(await get(db, 'feed', before)).toEqual({ rss: '<stale/>', atom: '<stale/>' })
    expect(await findRow(feedKey(after))).toBeNull()

    // A fresh request re-renders its own generation.
    const retry = vi.fn().mockResolvedValue({ rss: '<fresh-2/>', atom: '<fresh-2/>' })
    expect(await through(db, 'feed', after, retry)).toEqual({ rss: '<fresh-2/>', atom: '<fresh-2/>' })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('clearLocalizedOutputs deletes immediately, without waiting for in-flight loads', async () => {
    let release!: () => void
    let settled = false
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = through(db, 'feed', feedParams(), async () => {
      await gate
      settled = true
      return { rss: '<late/>', atom: '<late/>' }
    })

    // Synchronous and immediate: the call returns while the render is still
    // parked on its gate. Correctness never depends on this delete.
    clearLocalizedOutputs(db)
    expect(settled).toBe(false)

    release()
    await pending
    expect(settled).toBe(true)
  })

  it('clearLocalizedOutputs attempts every settings-derived bucket and throws the first failure', () => {
    const calls: string[] = []
    const failingDb = {
      delete: () => {
        calls.push('delete')
        throw new Error('disk gone')
      },
    }

    expect(() => clearLocalizedOutputs(failingDb as never)).toThrow('disk gone')
    expect(calls).toHaveLength(5)
  })

  it('remove deletes a single computed key', async () => {
    await through(db, 'categories', {}, async () => ['cat'])
    await remove(db, 'categories', {})

    expect(await findRow('categories:all')).toBeNull()
  })

  it('counter starts at 0, bumps monotonically, and memoizes', async () => {
    expect(await getCounter(db, 'searchResult')).toBe(0)

    await bumpCounter(db, 'searchResult')
    await bumpCounter(db, 'searchResult')
    expect(await getCounter(db, 'searchResult')).toBe(2)

    const row = await findRow('search-result:generation')
    expect(row?.bucket).toBe('searchResult')
    expect(row?.expiresAt).toBeNull()
  })

  it('counter re-reads the row after the test reset', async () => {
    await bumpCounter(db, 'searchResult')
    expect(await getCounter(db, 'searchResult')).toBe(1)

    // An out-of-band writer (e.g. a SQL shell) edits the counter directly.
    await db.update(kvCache).set({ value: 9 }).where(eq(kvCache.key, 'search-result:generation'))
    __resetCacheCountersForTests()

    expect(await getCounter(db, 'searchResult')).toBe(9)
  })

  it('devBypass re-runs the loader in dev but still writes the entry', async () => {
    // Vitest runs with PROD === false, so devBypass re-runs the loader on every through.
    const loader = vi.fn().mockResolvedValue(Buffer.from('png-1'))
    const params = {
      slug: 'post-x',
      title: 'T',
      summary: 'S',
      cover: '',
      settingsRevision: representationRevisionsFor(getBlogSettingsBundleSync()).og,
    }

    await through(db, 'og', params, loader)
    loader.mockResolvedValue(Buffer.from('png-2'))
    await through(db, 'og', params, loader)

    expect(loader).toHaveBeenCalledTimes(2)

    const cached = await get(db, 'og', params)
    expect(cached).toEqual(Buffer.from('png-2'))
  })
})
