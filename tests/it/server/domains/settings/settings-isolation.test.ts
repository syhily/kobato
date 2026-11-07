import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
const db = getTestDb()

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  resetBlogSettingsForTests()
})

describe('services/settings — write isolation', () => {
  it('parallel saves to mail and cache produce two scope-isolated UPSERTs', async () => {
    await Promise.all([
      updateBlogSettingsSection(
        db,
        'mail',
        {
          mail: { enabled: true, sender: 'a@example.com', smtpHost: 'smtp.example.com', smtpPass: 'KEY-A' },
        },
        null,
      ),
      updateBlogSettingsSection(
        db,
        'cache',
        {
          cache: {
            og: { prefix: 'og-bucket:', ttlSeconds: 60 * 60 * 24 },
            calendar: { prefix: 'cal-bucket:', ttlSeconds: 60 * 60 * 24 },
            avatar: { prefix: 'av-bucket:', ttlSeconds: 60 * 60 * 24 },
            imageMeta: { prefix: 'image-meta-bucket:', ttlSeconds: 60 * 60 * 24 },
            searchResult: { prefix: 'search-result-bucket:', ttlSeconds: 60 * 60 * 24 },
          },
        },
        null,
      ),
    ])

    const rows = await db.select().from(setting)
    const scopes = new Set(rows.map((r) => r.scope))
    expect(scopes).toEqual(new Set(['blog.mail', 'blog.cache']))

    for (const row of rows) {
      const data = row.data as Record<string, unknown>
      if (row.scope === 'blog.mail') {
        expect(data.mail).toBeDefined()
        expect(data.cache).toBeUndefined()
      } else {
        expect(data.cache).toBeDefined()
        expect(data.mail).toBeUndefined()
      }
    }
  })

  it('saving sidebar does not read or rewrite the mail row', async () => {
    await updateBlogSettingsSection(
      db,
      'sidebar',
      {
        sidebar: {
          widgets: [
            { type: 'search', enabled: true },
            { type: 'recentPosts', enabled: true, count: 5 },
            { type: 'recentComments', enabled: true, count: 5 },
            { type: 'randomTags', enabled: true, count: 10 },
            { type: 'todayCalendar', enabled: false },
          ],
        },
      },
      null,
    )

    const rows = await db.select().from(setting)
    expect(rows).toHaveLength(1)
    expect(rows[0].scope).toBe('blog.sidebar')
  })

  it('mail save with omitted smtpPass reads ONLY the mail scope, not any other section', async () => {
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: {
        mail: { enabled: true, smtpHost: 'old.example.com', smtpPass: 'KEEP-ME', sender: 'a@b.co' },
      },
      updatedBy: null,
    })

    await updateBlogSettingsSection(
      db,
      'mail',
      { mail: { enabled: true, smtpHost: 'smtp.example.com', sender: 'noreply@example.com' } },
      null,
    )

    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.mail'))
    expect(rows).toHaveLength(1)
    const mail = (rows[0].data as Record<string, unknown>).mail as Record<string, unknown>
    expect(typeof mail.smtpPass).toBe('string')
    expect((mail.smtpPass as string).length).toBeGreaterThan(0)
    expect(mail.smtpHost).toBe('smtp.example.com')
    expect(mail.sender).toBe('noreply@example.com')
  })
})
