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
  through,
} from '@/server/infra/cache/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'
import { APP_VERSION } from '@/shared/config/version'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  __resetCacheCountersForTests()
})

/** Fire-and-forget writes land asynchronously; wait for the observable entry. */
async function waitForEntry<T>(read: () => Promise<T | null>, expected: T): Promise<void> {
  await vi.waitFor(async () => {
    expect(await read()).toEqual(expected)
  })
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

describe('cache registry (integration)', () => {
  it('through round-trips a json entry: miss → loader, then hit', async () => {
    const loader = vi.fn().mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    const params = feedParams()

    const first = await through('feed', params, loader)
    await waitForEntry(() => get('feed', params), { rss: '<rss/>', atom: '<atom/>' })
    const second = await through('feed', params, loader)

    expect(first).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(second).toEqual(first)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clear deletes only the targeted bucket', async () => {
    await through('feed', feedParams(), async () => 'feed-xml')
    await through('sitemap', { settingsRevision: 'sitemap-rev' }, async () => '<urlset/>')
    await waitForEntry(() => get('feed', feedParams()), 'feed-xml')
    await waitForEntry(() => get('sitemap', { settingsRevision: 'sitemap-rev' }), '<urlset/>')

    clear('feed')

    expect(await get('feed', feedParams())).toBeNull()
    expect(await get('sitemap', { settingsRevision: 'sitemap-rev' })).toEqual('<urlset/>')
  })

  it('a feed-relevant settings write moves the key — the previous generation is unreachable', async () => {
    const before = feedParams()
    await through('feed', before, async () => ({ rss: '<old/>', atom: '<old/>' }))
    await waitForEntry(() => get('feed', before), { rss: '<old/>', atom: '<old/>' })

    setBlogSettingsBundleForTests(withChangedFeedSettings())
    const after = feedParams()
    expect(after.settingsRevision).not.toBe(before.settingsRevision)

    expect(await get('feed', after)).toBeNull()
    const loader = vi.fn().mockResolvedValue({ rss: '<new/>', atom: '<new/>' })
    expect(await through('feed', after, loader)).toEqual({ rss: '<new/>', atom: '<new/>' })
    expect(loader).toHaveBeenCalledTimes(1)

    // The old generation's bytes are still on disk (TTL reaps them) but no
    // request can address them any more.
    expect(await get('feed', before)).toEqual({ rss: '<old/>', atom: '<old/>' })
  })

  it('an UNRELATED settings write keeps the key — no needless invalidation', async () => {
    const params = feedParams()
    const loader = vi.fn().mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    await through('feed', params, loader)
    await waitForEntry(() => get('feed', params), { rss: '<rss/>', atom: '<atom/>' })

    // security is not in the feed scope's dependency list.
    setBlogSettingsBundleForTests(withChangedSecuritySettings())
    expect(feedParams().settingsRevision).toBe(params.settingsRevision)

    const again = await through('feed', params, loader)
    expect(again).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('an in-flight render started before a save writes only its old revision key', async () => {
    const before = feedParams()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = through('feed', before, async () => {
      await gate
      return { rss: '<stale/>', atom: '<stale/>' }
    })

    // A feed-relevant settings save lands while the render is still running; a
    // new request now addresses the new generation.
    setBlogSettingsBundleForTests(withChangedFeedSettings())
    const after = feedParams()
    const fresh = await through('feed', after, async () => ({ rss: '<fresh/>', atom: '<fresh/>' }))
    expect(fresh).toEqual({ rss: '<fresh/>', atom: '<fresh/>' })
    // The fresh write is fire-and-forget; let it land before reclamation so the
    // only possible post-clear writer is the parked stale render.
    await waitForEntry(() => get('feed', after), fresh)

    // Storage reclamation runs immediately — no drain, no wait.
    clearLocalizedOutputs()

    release()
    await pending
    await vi.waitFor(async () => {
      expect(await get('feed', before)).toEqual({ rss: '<stale/>', atom: '<stale/>' })
    })

    // The late write lands on the OLD key only; the new generation stays empty
    // rather than being polluted by the stale render.
    expect(await get('feed', after)).toBeNull()

    // A fresh request re-renders its own generation.
    const retry = vi.fn().mockResolvedValue({ rss: '<fresh-2/>', atom: '<fresh-2/>' })
    expect(await through('feed', after, retry)).toEqual({ rss: '<fresh-2/>', atom: '<fresh-2/>' })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('clearLocalizedOutputs reclaims immediately, without waiting for in-flight loads', async () => {
    let release!: () => void
    let settled = false
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = through('feed', feedParams(), async () => {
      await gate
      settled = true
      return { rss: '<late/>', atom: '<late/>' }
    })

    // Synchronous and immediate: the call returns while the render is still
    // parked on its gate. Correctness never depends on this delete.
    clearLocalizedOutputs()
    expect(settled).toBe(false)

    release()
    await pending
    expect(settled).toBe(true)
  })

  it('counter starts at 0, bumps monotonically, and memoizes', async () => {
    expect(await getCounter('searchResult')).toBe(0)

    bumpCounter('searchResult')
    bumpCounter('searchResult')
    expect(await getCounter('searchResult')).toBe(2)
  })

  it('counter re-reads the file after the test reset', async () => {
    bumpCounter('searchResult')
    expect(await getCounter('searchResult')).toBe(1)

    // An out-of-band writer edits the generation file directly.
    const { writeFileSync } = await import('node:fs')
    const path = await import('node:path')
    const { resolveCacheRoot } = await import('@/server/infra/cache/file-store')
    writeFileSync(path.join(resolveCacheRoot(), 'searchResult', '_generation'), '9')
    __resetCacheCountersForTests()

    expect(await getCounter('searchResult')).toBe(9)
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

    await through('og', params, loader)
    await waitForEntry(() => get('og', params), Buffer.from('png-1'))
    loader.mockResolvedValue(Buffer.from('png-2'))
    await through('og', params, loader)

    expect(loader).toHaveBeenCalledTimes(2)
    await waitForEntry(() => get('og', params), Buffer.from('png-2'))
  })
})
