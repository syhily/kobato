import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findTagByName: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagByName: mocks.findTagByName,
}))

import type { TagRow } from '@/server/infra/db/types'

import { findTagBySlug, resolveTagBySlugOrName } from '@/server/domains/taxonomies/tags/service'

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

describe('server/domains/taxonomies/tags/service — findTagBySlug', () => {
  it('returns the row when present', async () => {
    await expect(findTagBySlug(createMockDb([{ id: 1n }]), 'react')).resolves.toEqual({ id: 1n })
  })

  it('returns null when absent', async () => {
    await expect(findTagBySlug(createMockDb([]), 'react')).resolves.toBeNull()
  })
})

describe('server/domains/taxonomies/tags/service — resolveTagBySlugOrName', () => {
  it('returns the row on a slug hit without consulting the name lookup', async () => {
    const row = { id: 1n, name: 'React', slug: 'react' } as unknown as TagRow

    await expect(resolveTagBySlugOrName(createMockDb([row]), 'react')).resolves.toBe(row)
    expect(mocks.findTagByName).not.toHaveBeenCalled()
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const row = { id: 1n, name: 'React', slug: 'react' } as unknown as TagRow
    mocks.findTagByName.mockResolvedValue(row)

    await expect(resolveTagBySlugOrName(createMockDb([]), 'React')).resolves.toBe(row)
  })

  it('returns null when both slug and name miss', async () => {
    mocks.findTagByName.mockResolvedValue(null)

    await expect(resolveTagBySlugOrName(createMockDb([]), 'missing')).resolves.toBeNull()
  })
})
