import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { sectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { countEntryFiles, resolveCacheRoot } from '@/server/infra/cache/file-store'
import * as cacheRegistry from '@/server/infra/cache/registry'
import { get, set } from '@/server/infra/cache/registry'
import { APP_VERSION } from '@/shared/config/version'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'

// Composition-root pin: importing the lifecycle graph (through the integration
// helper) installs the REAL section handlers. The test never registers its own
// copies — deleting a registration turns this file red.
const db = getTestDb()

function revisions() {
  return resolveAppLocalization().revisions
}

function feedParams(settingsRevision = revisions().feed) {
  return { scope: 'all', locale: 'zh-CN' as const, version: APP_VERSION, settingsRevision }
}

function calendarParams(settingsRevision = revisions().calendar) {
  return {
    date: '2026-06-17',
    theme: 'light' as const,
    locale: 'zh-CN' as const,
    version: APP_VERSION,
    settingsRevision,
  }
}

function commentsParams(settingsRevision = revisions().comments) {
  return { settingsRevision, limit: 5 }
}

const ALL_SCOPES = ['detail', 'listing', 'feed', 'calendar', 'og', 'manifest', 'sitemap', 'comments'] as const
const PAGE_SCOPES = ['detail', 'listing'] as const

const INSTALL_INPUT = { title: 'Test Blog', name: 'Admin', email: 'admin@example.com', hostname: 'localhost' }

/** A stored `blog.general` row is the merge base a real admin save patches. */
function seedInstalledSite(): void {
  const built = buildInstallSectionRows(INSTALL_INPUT)
  if (!built.ok) {
    throw new Error(built.descriptor.fallbackMessage)
  }
  db.transaction((tx) => {
    seedInstallSections(tx, built.rows, null)
  })
}

beforeEach(async () => {
  await clearAllTables(db)
  seedInstalledSite()
  // Refresh (not hydrate — that could reuse the previous test's single-flight)
  // so `revisions()` starts from the seeded bundle's content hashes.
  await refreshBlogSettings(db)
})

describe('settings sections — section-scoped representation generations', () => {
  it('installs the reclaim handlers for every section whose values feed the renders', () => {
    for (const section of ['general', 'content', 'assets', 'sidebar', 'fonts', 'comments'] as const) {
      expect(typeof sectionChangeHandler(section)).toBe('function')
    }
  })

  it('admin-only sections (security/backup/limits/mail) move NO scope', async () => {
    const before = revisions()

    await updateBlogSettingsSection(db, 'security', { csrf: { enabled: false } }, null)
    expect(revisions()).toEqual(before)

    await updateBlogSettingsSection(db, 'backup', { retention: { days: 31 } }, null)
    expect(revisions()).toEqual(before)

    await updateBlogSettingsSection(db, 'limits', { maxRequestBodySize: 5 * 1024 * 1024 }, null)
    expect(revisions()).toEqual(before)

    await updateBlogSettingsSection(db, 'mail', { mail: { enabled: false } }, null)
    expect(revisions()).toEqual(before)

    expect(Object.keys(revisions()).sort()).toEqual([...ALL_SCOPES].sort())
  })

  it('general moves every public representation and the page shell, never comments', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'general', { locale: 'zh-TW' }, null)
    const after = revisions()

    for (const scope of [...PAGE_SCOPES, 'feed', 'calendar', 'og', 'manifest', 'sitemap'] as const) {
      expect(after[scope]).not.toBe(before[scope])
    }
    expect(after.comments).toBe(before.comments)
  })

  it('content moves feed + page shell only', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'content', { feed: { size: 5 } }, null)
    const after = revisions()

    expect(after.feed).not.toBe(before.feed)
    for (const scope of PAGE_SCOPES) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['calendar', 'og', 'manifest', 'sitemap', 'comments'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('assets moves feed + manifest + page shell', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'assets', { asset: { host: 'cdn.example.com' } }, null)
    const after = revisions()

    for (const scope of [...PAGE_SCOPES, 'feed', 'manifest'] as const) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['calendar', 'og', 'sitemap', 'comments'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('sidebar moves calendar + page shell, not feed/og/manifest/comments', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'sidebar', { sidebar: { dailyQuote: { source: 'local' } } }, null)
    const after = revisions()

    expect(after.calendar).not.toBe(before.calendar)
    for (const scope of PAGE_SCOPES) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['feed', 'og', 'manifest', 'sitemap', 'comments'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('seo moves og + page shell only', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'seo', { og: { width: 1200, height: 800 } }, null)
    const after = revisions()

    expect(after.og).not.toBe(before.og)
    for (const scope of PAGE_SCOPES) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['feed', 'calendar', 'manifest', 'sitemap', 'comments'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('fonts moves calendar + og + page shell', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'fonts', { og: { family: 'OPPO Sans' } }, null)
    const after = revisions()

    for (const scope of [...PAGE_SCOPES, 'calendar', 'og'] as const) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['feed', 'manifest', 'sitemap', 'comments'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('comments moves comments + page shell only', async () => {
    const before = revisions()
    await updateBlogSettingsSection(db, 'comments', { comments: { size: 20 } }, null)
    const after = revisions()

    expect(after.comments).not.toBe(before.comments)
    for (const scope of PAGE_SCOPES) {
      expect(after[scope]).not.toBe(before[scope])
    }
    for (const scope of ['feed', 'calendar', 'og', 'manifest', 'sitemap'] as const) {
      expect(after[scope]).toBe(before[scope])
    }
  })

  it('a relevant save moves the feed key and leaves a stale row unreachable', async () => {
    const before = feedParams()
    await set('feed', before, { rss: '<rss/>', atom: '<feed/>' })

    await updateBlogSettingsSection(db, 'content', { feed: { size: 5 } }, null)
    const after = feedParams()
    expect(after.settingsRevision).not.toBe(before.settingsRevision)
    expect(await get('feed', after)).toBeNull()
    // The section handler reclaimed the previous generation's rows too.
    expect(await get('feed', before)).toBeNull()
  })

  it('an unrelated save keeps feed/calendar/comments rows addressable', async () => {
    const feed = feedParams()
    const calendar = calendarParams()
    const comments = commentsParams()
    const sitemap = { settingsRevision: revisions().sitemap }
    await set('feed', feed, { rss: '<rss/>', atom: '<feed/>' })
    await set('calendar', calendar, Buffer.from('png'))
    await set('comments', comments, ['comment:1'])
    await set('sitemap', sitemap, '<urlset/>')

    await updateBlogSettingsSection(db, 'security', { csrf: { enabled: false } }, null)
    await updateBlogSettingsSection(db, 'backup', { retention: { days: 31 } }, null)

    expect(await get('feed', feed)).toEqual({ rss: '<rss/>', atom: '<feed/>' })
    expect(await get('calendar', calendar)).toEqual(Buffer.from('png'))
    expect(await get('comments', comments)).toEqual(['comment:1'])
    expect(await get('sitemap', sitemap)).toBe('<urlset/>')
  })

  it('comments scope moves the comments key (the count is a key input too)', async () => {
    const before = commentsParams()
    await set('comments', before, ['comment:1'])

    await updateBlogSettingsSection(db, 'comments', { comments: { size: 20 } }, null)
    const after = commentsParams()
    expect(after.settingsRevision).not.toBe(before.settingsRevision)
    expect(await get('comments', after)).toBeNull()
    // The reclaim handler deletes the whole comments bucket.
    expect(await get('comments', before)).toBeNull()

    // Same generation, different count: another key.
    expect(await get('comments', { ...after, limit: 6 })).toBeNull()
  })

  it('drops every settings-derived bucket variant on a real section update', async () => {
    const feed = feedParams()
    const calendar = calendarParams()
    const comments = commentsParams()
    await set('feed', feed, { rss: '<rss/>', atom: '<feed/>' })
    await set('feed', { ...feed, locale: 'en-US' }, { rss: '<rss/>', atom: '<feed/>' })
    await set('calendar', calendar, Buffer.from('png'))
    await set('calendar', { ...calendar, theme: 'dark', locale: 'zh-TW' }, Buffer.from('png'))
    await set(
      'og',
      { slug: 'post-x', title: 'T', summary: 'S', cover: 'C', settingsRevision: revisions().og },
      Buffer.from('png'),
    )
    await set('comments', comments, ['comment:1'])
    await set('sitemap', { settingsRevision: revisions().sitemap }, '<urlset/>')
    // An unrelated bucket must survive the save.
    await set('tags', {}, ['tag:1'])

    const result = await updateBlogSettingsSection(db, 'general', { locale: 'zh-TW' }, null)
    expect(result.warnings).toEqual([])

    expect(await get('feed', feed)).toBeNull()
    expect(await get('feed', { ...feed, locale: 'en-US' })).toBeNull()
    expect(await get('calendar', calendar)).toBeNull()
    expect(await get('calendar', { ...calendar, theme: 'dark', locale: 'zh-TW' })).toBeNull()
    expect(await get('comments', comments)).toBeNull()
    expect(await get('tags', {})).toEqual(['tag:1'])

    for (const bucket of ['feed', 'calendar', 'og', 'comments', 'sitemap'] as const) {
      expect(await countEntryFiles(bucket)).toBe(0)
    }
  })

  it('does not wait for an in-flight render; the late write cannot reach the new generation', async () => {
    const before = feedParams()
    let settled = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pendingFeed = cacheRegistry.through('feed', before, async () => {
      await gate
      settled = true
      return { rss: '<stale/>', atom: '<stale/>' }
    })

    // The save completes while the render is still parked — no drain.
    const result = await updateBlogSettingsSection(db, 'general', { locale: 'zh-TW' }, null)
    expect(result.warnings).toEqual([])
    expect(settled).toBe(false)

    release()
    await pendingFeed
    // The write is fire-and-forget — wait for the late entry to land.
    await vi.waitFor(async () => {
      expect(await get('feed', before)).toEqual({ rss: '<stale/>', atom: '<stale/>' })
    })

    const after = feedParams()
    expect(after.settingsRevision).not.toBe(before.settingsRevision)
    // The stale render wrote its own (old) generation key; the new one stays empty.
    expect(await get('feed', before)).toEqual({ rss: '<stale/>', atom: '<stale/>' })
    expect(await get('feed', after)).toBeNull()
  })

  it('routes a bucket-clear failure into the save warning channel', async () => {
    const failure = new Error('cache db unavailable')
    const spy = vi.spyOn(cacheRegistry, 'clearLocalizedOutputs').mockImplementationOnce(() => {
      throw failure
    })

    const result = await updateBlogSettingsSection(db, 'general', { locale: 'zh-TW' }, null)

    expect(spy).toHaveBeenCalledOnce()
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ messageKey: 'admin.settings.warnings.sectionChangeFailed' })
  })

  it('does not fabricate a generation counter for the cleared buckets', async () => {
    await set('feed', feedParams(), { rss: '<rss/>', atom: '<feed/>' })
    await updateBlogSettingsSection(db, 'general', { locale: 'zh-CN' }, null)

    for (const bucket of ['feed', 'calendar', 'og', 'comments', 'sitemap'] as const) {
      expect(existsSync(path.join(resolveCacheRoot(), bucket, '_generation'))).toBe(false)
    }
  })
})
