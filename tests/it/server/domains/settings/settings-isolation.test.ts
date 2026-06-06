import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await db.delete(setting)
  setBlogSettingsBundleForTests(undefined)
})

describe('services/settings — write isolation', () => {
  it('parallel saves to mail and cache produce two scope-isolated UPSERTs', async () => {
    await Promise.all([
      updateBlogSettingsSection(
        db,
        pool,
        'mail',
        {
          mail: { enabled: true, host: 'api.zeabur.com', apiKey: 'KEY-A', sender: 'a@example.com' },
        },
        null,
      ),
      updateBlogSettingsSection(
        db,
        pool,
        'cache',
        {
          cache: {
            og: { prefix: 'og-bucket:', ttlSeconds: 60 * 60 * 24 },
            calendar: { prefix: 'cal-bucket:', ttlSeconds: 60 * 60 * 24 },
            avatar: { prefix: 'av-bucket:', ttlSeconds: 60 * 60 * 24 },
            imageMeta: { prefix: 'image-meta-bucket:', ttlSeconds: 60 * 60 * 24 },
            embeddingSearch: { prefix: 'embedding-search-bucket:', ttlSeconds: 60 * 60 * 24 },
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
      pool,
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

  it('mail save with omitted apiKey reads ONLY the mail scope, not any other section', async () => {
    await db.insert(setting).values({
      scope: 'blog.mail',
      data: {
        mail: { enabled: true, host: 'old.example.com', apiKey: 'KEEP-ME', sender: 'a@b.co' },
      },
      updatedBy: null,
    })

    await updateBlogSettingsSection(
      db,
      pool,
      'mail',
      { mail: { enabled: true, host: 'api.zeabur.com', sender: 'noreply@example.com' } },
      null,
    )

    const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.mail'))
    expect(rows).toHaveLength(1)
    const mail = (rows[0].data as Record<string, unknown>).mail as Record<string, unknown>
    expect(typeof mail.apiKey).toBe('string')
    expect((mail.apiKey as string).length).toBeGreaterThan(0)
    expect(mail.host).toBe('api.zeabur.com')
    expect(mail.sender).toBe('noreply@example.com')
  })
})
