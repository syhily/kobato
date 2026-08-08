import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { setting } from '@/server/infra/db/schema/config'

// A section with no SECRET_FIELDS entry never reaches the crypto module —
// the save succeeds even with ENCRYPTION_KEY unset.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  // Evict the snapshot so the post-write refresh re-reads the database.
  resetBlogSettingsForTests()
  // The snapshot hydrates only once siteIdentity AND assets rows exist.
  await db.insert(setting).values({
    scope: 'blog.assets',
    data: {
      asset: { host: 'cdn.example.com', scheme: 'https' },
      storage: {
        enabled: false,
        endpoint: '',
        region: '',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        forcePathStyle: false,
        urlTemplate: '',
      },
      upload: { maxBytes: 5 * 1024 * 1024, jpegQuality: 85 },
    },
  })
})

describe('settings service — ENCRYPTION_KEY guard', () => {
  it('allows saving a non-secret section', async () => {
    const result = await updateBlogSettingsSection(
      db,
      'general',
      {
        title: 'Test',
        description: 'A test blog',
        website: 'https://example.com',
        keywords: [],
        author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'yyyy-LL-dd HH:mm',
        initialYear: 2024,
      },
      null,
    )

    expect(result).not.toBeNull()
    expect(result.bundle?.siteIdentity?.title).toBe('Test')

    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.general'))
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({
      title: 'Test',
      author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com' },
    })
  })
})
