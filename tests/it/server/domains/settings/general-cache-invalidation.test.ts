import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { sectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { get, set } from '@/server/infra/cache/registry'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { APP_VERSION } from '@/shared/config/version'

// Composition-root pin: importing the lifecycle graph (through the integration
// helper) installs the REAL `general` handler. The test never registers its own
// copy — deleting the registration turns this file red.
const db = getTestDb()

const FEED_PARAMS = { scope: 'all', locale: 'zh-CN' as const, version: APP_VERSION }
const CALENDAR_PARAMS = { date: '2026-06-17', theme: 'light' as const, locale: 'zh-CN' as const, version: APP_VERSION }

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
})

describe('settings general — rendered-cache invalidation', () => {
  it('has the real general handler installed by the composition root', () => {
    expect(typeof sectionChangeHandler('general')).toBe('function')
  })

  it('drops every feed and calendar locale variant on a real section update', async () => {
    await set(db, 'feed', FEED_PARAMS, { rss: '<rss/>', atom: '<feed/>' })
    await set(db, 'feed', { ...FEED_PARAMS, locale: 'en-US' }, { rss: '<rss/>', atom: '<feed/>' })
    await set(db, 'calendar', CALENDAR_PARAMS, Buffer.from('png'))
    await set(db, 'calendar', { ...CALENDAR_PARAMS, theme: 'dark', locale: 'zh-TW' }, Buffer.from('png'))
    // A language-independent bucket must survive the general save.
    await set(db, 'sitemap', {}, ['post:1'])

    const result = await updateBlogSettingsSection(db, 'general', { locale: 'zh-TW' }, null)
    expect(result.warnings).toEqual([])

    expect(await get(db, 'feed', FEED_PARAMS)).toBeNull()
    expect(await get(db, 'feed', { ...FEED_PARAMS, locale: 'en-US' })).toBeNull()
    expect(await get(db, 'calendar', CALENDAR_PARAMS)).toBeNull()
    expect(await get(db, 'calendar', { ...CALENDAR_PARAMS, theme: 'dark', locale: 'zh-TW' })).toBeNull()
    expect(await get(db, 'sitemap', {})).toEqual(['post:1'])

    const rows = await db.select({ bucket: kvCache.bucket }).from(kvCache)
    expect(rows.some((row) => row.bucket === 'feed')).toBe(false)
    expect(rows.some((row) => row.bucket === 'calendar')).toBe(false)
  })

  it('does not fabricate a generation counter for the cleared buckets', async () => {
    await set(db, 'feed', FEED_PARAMS, { rss: '<rss/>', atom: '<feed/>' })
    await updateBlogSettingsSection(db, 'general', { locale: 'zh-CN' }, null)

    const keys = (await db.select({ key: kvCache.key }).from(kvCache)).map((row) => row.key)
    expect(keys.filter((key) => key.includes('generation'))).toEqual([])
  })
})
