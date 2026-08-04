import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { findTagBySlug, resolveTagBySlugOrName } from '@kobato/server/domains/taxonomies/tags/service'
import { tag } from '@kobato/server/infra/db/schema/taxonomy'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedTag(name: string, slug: string): Promise<typeof tag.$inferSelect> {
  const rows = await db.insert(tag).values({ name, slug }).returning()
  return rows[0]!
}

describe('server/domains/taxonomies/tags/service — findTagBySlug', () => {
  it('returns the row when present', async () => {
    const seeded = await seedTag('React', 'react')

    const row = await findTagBySlug(db, 'react')

    expect(row?.id).toBe(seeded.id)
    expect(row?.name).toBe('React')
    expect(row?.slug).toBe('react')
  })

  it('returns null when absent', async () => {
    await seedTag('React', 'react')

    await expect(findTagBySlug(db, 'vue')).resolves.toBeNull()
  })
})

describe('server/domains/taxonomies/tags/service — resolveTagBySlugOrName', () => {
  it('prefers the slug hit over a name hit on another row', async () => {
    // A row whose NAME equals the query exists alongside the slug hit —
    // the real engine proves the name lookup is never consulted (the
    // Postgres-era unit test asserted this via a mock call count).
    const bySlug = await seedTag('React', 'react')
    await seedTag('react', 'react-as-name')

    const row = await resolveTagBySlugOrName(db, 'react')

    expect(row?.id).toBe(bySlug.id)
    expect(row?.slug).toBe('react')
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const seeded = await seedTag('React', 'react')

    const row = await resolveTagBySlugOrName(db, 'React')

    expect(row?.id).toBe(seeded.id)
    expect(row?.name).toBe('React')
  })

  it('returns null when both slug and name miss', async () => {
    await seedTag('React', 'react')

    await expect(resolveTagBySlugOrName(db, 'missing')).resolves.toBeNull()
  })
})
