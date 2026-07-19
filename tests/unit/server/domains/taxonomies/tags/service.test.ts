import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findTagBySlug: vi.fn(),
  findTagByName: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagBySlug: mocks.findTagBySlug,
  findTagByName: mocks.findTagByName,
}))

import type { TagRow } from '@/server/infra/db/types'

import { resolveTagBySlugOrName } from '@/server/domains/taxonomies/tags/service'

const db = {} as NodePgDatabase

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server/domains/taxonomies/tags/service — resolveTagBySlugOrName', () => {
  it('returns the row on a slug hit without consulting the name lookup', async () => {
    const row = { id: 1n, name: 'React', slug: 'react' } as TagRow
    mocks.findTagBySlug.mockResolvedValue(row)

    await expect(resolveTagBySlugOrName(db, 'react')).resolves.toBe(row)
    expect(mocks.findTagByName).not.toHaveBeenCalled()
  })

  it('falls back to the name lookup when the slug misses', async () => {
    const row = { id: 1n, name: 'React', slug: 'react' } as TagRow
    mocks.findTagBySlug.mockResolvedValue(null)
    mocks.findTagByName.mockResolvedValue(row)

    await expect(resolveTagBySlugOrName(db, 'React')).resolves.toBe(row)
  })

  it('returns null when both slug and name miss', async () => {
    mocks.findTagBySlug.mockResolvedValue(null)
    mocks.findTagByName.mockResolvedValue(null)

    await expect(resolveTagBySlugOrName(db, 'missing')).resolves.toBeNull()
  })
})
