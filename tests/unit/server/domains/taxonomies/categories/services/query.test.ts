import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCategoryByName: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryByName: mocks.findCategoryByName,
}))

import type { CategoryRow } from '@/server/infra/db/types'

import { findCategoryBySlug, resolveCategoryBySlugOrName } from '@/server/domains/taxonomies/categories/services/query'

// Drizzle-chain stand-in: every method returns the same builder and
// awaiting it resolves the fixed row set (mirrors the createMockDb
// pattern in tests/unit/server/infra/db/operations/tag.test.ts). The
// where clause is intentionally not modeled.
function createMockDb(rows: Array<Record<string, unknown>> = []) {
  const finalResult = rows
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled?: (v: Array<Record<string, unknown>>) => unknown) =>
            Promise.resolve(finalResult).then(onFulfilled)
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server/domains/taxonomies/categories/services/query — findCategoryBySlug', () => {
  it('returns the row when present', async () => {
    await expect(findCategoryBySlug(createMockDb([{ id: 1n }]), 'tech')).resolves.toEqual({ id: 1n })
  })

  it('returns null when absent', async () => {
    await expect(findCategoryBySlug(createMockDb([]), 'tech')).resolves.toBeNull()
  })
})

describe('server/domains/taxonomies/categories/services/query — resolveCategoryBySlugOrName', () => {
  it('returns the row on a slug hit without consulting the name lookup', async () => {
    const row = { id: 1n, name: '技术', slug: 'tech' } as unknown as CategoryRow

    await expect(resolveCategoryBySlugOrName(createMockDb([row]), 'tech')).resolves.toBe(row)
    expect(mocks.findCategoryByName).not.toHaveBeenCalled()
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const row = { id: 1n, name: '技术', slug: 'tech' } as unknown as CategoryRow
    mocks.findCategoryByName.mockResolvedValue(row)

    await expect(resolveCategoryBySlugOrName(createMockDb([]), '技术')).resolves.toBe(row)
  })

  it('returns null when both slug and name miss', async () => {
    mocks.findCategoryByName.mockResolvedValue(null)

    await expect(resolveCategoryBySlugOrName(createMockDb([]), 'missing')).resolves.toBeNull()
  })
})
