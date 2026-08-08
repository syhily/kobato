import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import { slugRegistry } from '@/server/infra/db/schema/config'
import { isUniqueConstraintError } from '@/server/infra/http/errors'

// Real engine; the single-connection engine serialises writers, so a
// same-entity row at insert time was already there at pre-check time.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedRegistryRow(slug: string, entityType: 'post' | 'page', entityId: number): Promise<void> {
  await db.insert(slugRegistry).values({ slug, entityType, entityId })
}

async function registryRowFor(slug: string) {
  const rows = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, slug))
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

describe('content/slug-reclaim — reclaimSlugOnRestore', () => {
  it('reclaims a free slug and returns no warning', async () => {
    const warning = reclaimSlugOnRestore(db, 'post', 1, 'hello')

    expect(warning).toBeUndefined()
    const row = await registryRowFor('hello')
    expect(row).not.toBeNull()
    expect(row?.entityType).toBe('post')
    expect(row?.entityId).toBe(1)
  })

  it.each([
    {
      restoring: 'post' as const,
      owner: 'post' as const,
      message: 'slug "hello" 已被另一个文章占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。',
    },
    {
      restoring: 'post' as const,
      owner: 'page' as const,
      message: 'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。',
    },
    {
      restoring: 'page' as const,
      owner: 'post' as const,
      message: 'slug "hello" 已被另一个文章占用，恢复后该 URL 不会指向此页面。请修改 slug 或先处理占用方。',
    },
    {
      restoring: 'page' as const,
      owner: 'page' as const,
      message: 'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此页面。请修改 slug 或先处理占用方。',
    },
  ])(
    'warns and skips the insert when another $owner owns the slug of a restored $restoring',
    async ({ restoring, owner, message }) => {
      await seedRegistryRow('hello', owner, 2)

      const warning = reclaimSlugOnRestore(db, restoring, 1, 'hello')

      expect(warning).toBe(message)
      const row = await registryRowFor('hello')
      expect(row?.entityType).toBe(owner)
      expect(row?.entityId).toBe(2)
    },
  )

  it('throws when the restoring entity already owns a different slug', async () => {
    // The entity unique index fires first — a leaked row, not a slug conflict.
    await seedRegistryRow('other', 'post', 1)

    const caught = catchSync(() => reclaimSlugOnRestore(db, 'post', 1, 'hello'))
    expect(isUniqueConstraintError(caught)).toBe(true)
    expect(await registryRowFor('hello')).toBeNull()
  })

  it('throws when the registry already holds the slug for the restoring entity itself', async () => {
    // Same-entity: pre-check passes, the insert hits the unique violation.
    await seedRegistryRow('hello', 'post', 1)

    const caught = catchSync(() => reclaimSlugOnRestore(db, 'post', 1, 'hello'))
    expect(isUniqueConstraintError(caught)).toBe(true)
  })
})
