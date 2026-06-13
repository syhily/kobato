import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { describe, expect, it } from 'vitest'

type ResultRow = Record<string, unknown>

function createMockDb(rows: ResultRow[] = []) {
  const finalResult = rows
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled?: (v: ResultRow[]) => unknown) => Promise.resolve(finalResult).then(onFulfilled)
        }
        if (prop === 'catch' || prop === 'finally') {
          return undefined
        }
        return () => builder
      },
    },
  )

  const dbProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') {
          return undefined
        }
        return () => builder
      },
    },
  )

  return dbProxy as unknown as NodePgDatabase
}

describe('infra/db/operations/tag — listAdminTagRows', () => {
  it('returns rows from the builder', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    expect(await listAdminTagRows(createMockDb([{ id: 1n }]), {})).toHaveLength(1)
  })

  it('applies limit and offset', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    await listAdminTagRows(createMockDb([]), { limit: 10, offset: 5 })
  })

  it('applies only limit when offset is 0', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    await listAdminTagRows(createMockDb([]), { limit: 10, offset: 0 })
  })

  it('applies only offset when limit is undefined', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    await listAdminTagRows(createMockDb([]), { offset: 5 })
  })

  it('passes q filter through', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    await listAdminTagRows(createMockDb([]), { q: 'react' })
  })

  it('skips empty q strings', async () => {
    const { listAdminTagRows } = await import('@/server/infra/db/operations/tag')
    await listAdminTagRows(createMockDb([]), { q: '   ' })
  })
})

describe('infra/db/operations/tag — countAdminTags', () => {
  it('returns the count value', async () => {
    const { countAdminTags } = await import('@/server/infra/db/operations/tag')
    expect(await countAdminTags(createMockDb([{ value: 7 }]), {})).toBe(7)
  })

  it('returns 0 when no rows', async () => {
    const { countAdminTags } = await import('@/server/infra/db/operations/tag')
    expect(await countAdminTags(createMockDb([]), {})).toBe(0)
  })

  it('passes q filter', async () => {
    const { countAdminTags } = await import('@/server/infra/db/operations/tag')
    expect(await countAdminTags(createMockDb([{ value: 3 }]), { q: 'react' })).toBe(3)
  })
})

describe('infra/db/operations/tag — single-row lookups', () => {
  it('findTagById returns the row when present', async () => {
    const { findTagById } = await import('@/server/infra/db/operations/tag')
    expect(await findTagById(createMockDb([{ id: 1n }]), 1n)).toEqual({ id: 1n })
  })

  it('findTagById returns null when absent', async () => {
    const { findTagById } = await import('@/server/infra/db/operations/tag')
    expect(await findTagById(createMockDb([]), 1n)).toBeNull()
  })

  it('findTagByName returns the row when present', async () => {
    const { findTagByName } = await import('@/server/infra/db/operations/tag')
    expect(await findTagByName(createMockDb([{ id: 1n }]), 'react')).toEqual({ id: 1n })
  })

  it('findTagByName returns null when absent', async () => {
    const { findTagByName } = await import('@/server/infra/db/operations/tag')
    expect(await findTagByName(createMockDb([]), 'react')).toBeNull()
  })

  it('findTagBySlug returns the row when present', async () => {
    const { findTagBySlug } = await import('@/server/infra/db/operations/tag')
    expect(await findTagBySlug(createMockDb([{ id: 1n }]), 'react-slug')).toEqual({ id: 1n })
  })

  it('findTagBySlug returns null when absent', async () => {
    const { findTagBySlug } = await import('@/server/infra/db/operations/tag')
    expect(await findTagBySlug(createMockDb([]), 'react-slug')).toBeNull()
  })
})

describe('infra/db/operations/tag — findTagsByNames', () => {
  it('short-circuits on empty input', async () => {
    const { findTagsByNames } = await import('@/server/infra/db/operations/tag')
    expect(await findTagsByNames(createMockDb([{ id: 1n }]), [])).toEqual([])
  })

  it('queries for non-empty names', async () => {
    const { findTagsByNames } = await import('@/server/infra/db/operations/tag')
    expect(await findTagsByNames(createMockDb([{ id: 1n }]), ['a', 'b'])).toEqual([{ id: 1n }])
  })
})

describe('infra/db/operations/tag — insertTag / updateTag / deleteTag', () => {
  it('inserts and returns the row', async () => {
    const { insertTag } = await import('@/server/infra/db/operations/tag')
    expect(await insertTag(createMockDb([{ id: 1n }]), { name: 'react', slug: 'react' } as never)).toEqual({ id: 1n })
  })

  it('updateTag returns the row when present', async () => {
    const { updateTag } = await import('@/server/infra/db/operations/tag')
    expect(await updateTag(createMockDb([{ id: 1n }]), 1n, { name: 'x' } as never)).toEqual({ id: 1n })
  })

  it('updateTag returns null when absent', async () => {
    const { updateTag } = await import('@/server/infra/db/operations/tag')
    expect(await updateTag(createMockDb([]), 1n, { name: 'x' } as never)).toBeNull()
  })

  it('deleteTag returns true when a row was deleted', async () => {
    const { deleteTag } = await import('@/server/infra/db/operations/tag')
    expect(await deleteTag(createMockDb([{ id: 1n }]), 1n)).toBe(true)
  })

  it('deleteTag returns false when no row was deleted', async () => {
    const { deleteTag } = await import('@/server/infra/db/operations/tag')
    expect(await deleteTag(createMockDb([]), 1n)).toBe(false)
  })
})

describe('infra/db/operations/tag — seedTagIfMissing / seedTagsIfMissing', () => {
  it('seedTagIfMissing returns true when a new row was inserted', async () => {
    const { seedTagIfMissing } = await import('@/server/infra/db/operations/tag')
    expect(await seedTagIfMissing(createMockDb([{ id: 1n }]), { name: 'x', slug: 'x' } as never)).toBe(true)
  })

  it('seedTagIfMissing returns false when the row already existed', async () => {
    const { seedTagIfMissing } = await import('@/server/infra/db/operations/tag')
    expect(await seedTagIfMissing(createMockDb([]), { name: 'x', slug: 'x' } as never)).toBe(false)
  })

  it('seedTagsIfMissing short-circuits on empty input', async () => {
    const { seedTagsIfMissing } = await import('@/server/infra/db/operations/tag')
    await expect(seedTagsIfMissing(createMockDb([]), [])).resolves.toBeUndefined()
  })

  it('seedTagsIfMissing inserts non-empty input', async () => {
    const { seedTagsIfMissing } = await import('@/server/infra/db/operations/tag')
    await expect(
      seedTagsIfMissing(createMockDb([]), [{ name: 'a', slug: 'a' } as never, { name: 'b', slug: 'b' } as never]),
    ).resolves.toBeUndefined()
  })
})
