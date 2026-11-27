import { APP_VERSION } from '@kobato/base/distribution/app'
import { countEntryFiles } from '@kobato/server/infra/cache/file-store'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { lexicalBodyWith, lexicalParagraph, stubMusicResolver } from '@kobato/server/tests/utils/lexical'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function feedRowCount(): Promise<number> {
  return countEntryFiles('feed')
}

describe('taxonomy cache invalidation', () => {
  it('shows a renamed tag immediately after upsertAdminTag (no TTL wait)', async () => {
    const { upsertAdminTag, listAllTags } = await import('@kobato/server/domains/taxonomies/tags/service')
    const created = await upsertAdminTag(db, { name: 'OldName' })

    const primed = await listAllTags(db)
    expect(primed.map((t) => t.name)).toContain('OldName')

    await upsertAdminTag(db, { id: Number(created.id), name: 'NewName' })

    const after = await listAllTags(db)
    expect(after.map((t) => t.name)).toContain('NewName')
    expect(after.map((t) => t.name)).not.toContain('OldName')
  })

  it('clears the whole feed bucket when a category is renamed', async () => {
    const { upsertAdminCategory } = await import('@kobato/server/domains/taxonomies/categories/services/mutate')
    const { set } = await import('@kobato/server/infra/cache/registry')
    const created = await upsertAdminCategory(db, { name: 'FeedCat', cover: '', description: '' })

    const settingsRevision = getBlogSettingsSnapshotSync().revision
    await set('feed', { scope: 'all', locale: 'zh-CN', version: APP_VERSION, settingsRevision }, '<xml>all</xml>')
    await set(
      'feed',
      { scope: 'cat:feedcat', locale: 'zh-CN', version: APP_VERSION, settingsRevision },
      '<xml>cat</xml>',
    )
    expect(await feedRowCount()).toBe(2)

    await upsertAdminCategory(db, { id: Number(created.id), name: 'FeedCatRenamed', cover: '', description: '' })

    expect(await feedRowCount()).toBe(0)
  })

  it('increments a tag count immediately when a post carrying the tag is published', async () => {
    const { listAllTags } = await import('@kobato/server/domains/taxonomies/tags/service')

    const primed = await listAllTags(db)
    expect(primed.find((t) => t.name === 'CacheTag')).toBeUndefined()

    const { createPost } = await import('@kobato/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Cache Post', tags: ['CacheTag'] }, null)
    const { saveBody } = await import('@kobato/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@kobato/server/domains/posts/services/lifecycle-adapter')
    const r = await saveBody(
      db,
      postLifecycleAdapter,
      {
        entityId: Number(created.id),
        body: lexicalBodyWith([lexicalParagraph('pub')]),
        authorId: null,
        resolveMusicEmbeds: stubMusicResolver(),
      },
      'publish',
    )
    expect(r.status).toBe('saved')

    const after = await listAllTags(db)
    expect(after.find((t) => t.name === 'CacheTag')?.counts).toBe(1)
  })
})
