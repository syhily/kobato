import { sqliteOf } from '@kobato/db/sqlite/database'
import { isUniqueConstraintError } from '@kobato/db/sqlite/errors'
import { restoreEntityReclaimingSlug } from '@kobato/db/sqlite/operations/content/entity-lifecycle'
import { slugRegistry } from '@kobato/db/sqlite/schema/config'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { clearAllTables, getTestDb } from '@kobato/db/tests/utils/integration-db'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedRegistryRow(slug: string, entityType: 'post' | 'page', entityId: number): Promise<void> {
  await sqliteOf(db).insert(slugRegistry).values({ slug, entityType, entityId })
}

async function registryRowFor(slug: string) {
  const rows = await sqliteOf(db).select().from(slugRegistry).where(eq(slugRegistry.slug, slug))
  return rows[0] ?? null
}

function catchSync(fn: () => unknown): unknown {
  try {
    fn()
  } catch (err) {
    return err
  }
  return undefined
}

function restoreSlug(entityType: 'post' | 'page', entityId: number, slug: string) {
  const table = entityType === 'post' ? post : page
  sqliteOf(db).insert(table).values({ id: entityId, slug, title: 'Restore', deletedAt: new Date() }).run()
  return restoreEntityReclaimingSlug(db, entityType, entityId)
}

describe('restoreEntityReclaimingSlug', () => {
  it('reclaims a free slug and returns no warning', async () => {
    const result = await restoreSlug('post', 1, 'hello')

    expect(result.restored).toBe(true)
    expect(result.slugConflict).toBeUndefined()
    expect(result.slugStolen).toBeUndefined()
    const row = await registryRowFor('hello')
    expect(row).not.toBeNull()
    expect(row?.entityType).toBe('post')
    expect(row?.entityId).toBe(1)
  })

  it.each([
    {
      restoring: 'post' as const,
      owner: 'post' as const,
    },
    {
      restoring: 'post' as const,
      owner: 'page' as const,
    },
    {
      restoring: 'page' as const,
      owner: 'post' as const,
    },
    {
      restoring: 'page' as const,
      owner: 'page' as const,
    },
  ])(
    'warns and skips the insert when another $owner owns the slug of a restored $restoring',
    async ({ restoring, owner }) => {
      await seedRegistryRow('hello', owner, 2)

      const result = await restoreSlug(restoring, 1, 'hello')

      expect(result.slugConflict).toEqual({ occupantType: owner })
      const row = await registryRowFor('hello')
      expect(row?.entityType).toBe(owner)
      expect(row?.entityId).toBe(2)
    },
  )

  it('throws when the restoring entity already owns a different slug', async () => {
    await seedRegistryRow('other', 'post', 1)

    const caught = catchSync(() => restoreSlug('post', 1, 'hello'))
    expect(isUniqueConstraintError(caught)).toBe(true)
    expect(await registryRowFor('hello')).toBeNull()
  })

  it('throws when the registry already holds the slug for the restoring entity itself', async () => {
    await seedRegistryRow('hello', 'post', 1)

    const caught = catchSync(() => restoreSlug('post', 1, 'hello'))
    expect(isUniqueConstraintError(caught)).toBe(true)
  })
})
