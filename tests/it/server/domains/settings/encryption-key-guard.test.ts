import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { setting } from '@/server/infra/db/schema/config'

// The encryption-key guard: a section with no SECRET_FIELDS entry
// (general here) never reaches the crypto module on the write path, so
// the save succeeds even in a deployment whose ENCRYPTION_KEY is unset.
// The Postgres-era unit test proved this by deleting the key through a
// config mock; the real-engine version exercises the same write end to
// end — no secret field means `encryptSecretsInRow` is a no-op on this
// path, and the row lands in the `setting` table for real.
const handle = createTestDatabase()
const db: Database = handle.db

afterAll(() => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
  // Evict the in-process snapshot so the post-write refresh re-reads
  // the database instead of serving a stale hydration.
  resetBlogSettingsForTests()
  // The snapshot only hydrates once siteIdentity AND assets rows exist;
  // seed assets so the post-write refresh returns a bundle.
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
    expect(result?.siteIdentity?.title).toBe('Test')

    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.general'))
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({
      title: 'Test',
      author: { name: 'Tester', email: 'test@example.com', url: 'https://example.com' },
    })
  })
})
