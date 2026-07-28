import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { SlugRegistryRow } from '@/server/infra/db/schema/config'

import { findSlugRegistryBySlugForUpdate } from '@/server/infra/db/operations/slug-registry'
import { DomainError } from '@/server/infra/http/errors'
import { reserveSlugInTransaction } from '@/server/infra/slug/reservation'

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  findSlugRegistryBySlugForUpdate: vi.fn(),
}))

const db = {} as unknown as Database

// Sync (node:sqlite): the reservation helpers run inside transactions, so
// the mock seams return values directly, not promises.
function mockFindOwnMeta(result: { id: number } | null) {
  return vi.fn(() => result)
}

function registryRow(
  overrides: Partial<SlugRegistryRow> & { slug: string; entityType: 'post' | 'page'; entityId: number },
): SlugRegistryRow {
  const now = overrides.createdAt ?? new Date('2026-06-16T00:00:00.000Z')
  return {
    id: overrides.id ?? 1,
    slug: overrides.slug,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    createdAt: now,
  }
}

function setRegistryMock(value: SlugRegistryRow | null) {
  vi.mocked(
    findSlugRegistryBySlugForUpdate as unknown as (tx: Database, slug: string) => SlugRegistryRow | null,
  ).mockReturnValue(value)
}

describe('reserveSlugInTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows the slug when no own meta and no registry entry exists', () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta(null)

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).not.toThrow()

    expect(findOwnMeta).toHaveBeenCalledWith(db, 'hello')
    expect(findSlugRegistryBySlugForUpdate).toHaveBeenCalledWith(db, 'hello')
  })

  it('throws CONFLICT when another own entity has the same slug', () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta({ id: 99 })

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', 1, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).toThrowError(DomainError)
    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', 1, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).toThrow('slug "hello" 已被其它文章占用。')
  })

  it('throws CONFLICT when a different entity type holds the slug', () => {
    setRegistryMock(registryRow({ slug: 'hello', entityType: 'page', entityId: 42 }))
    const findOwnMeta = mockFindOwnMeta(null)

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).toThrow('slug "hello" 已被其它页面占用。')
  })

  it('allows updating the same entity with its existing slug', () => {
    setRegistryMock(registryRow({ slug: 'hello', entityType: 'post', entityId: 1 }))
    const findOwnMeta = mockFindOwnMeta({ id: 1 })

    expect(() =>
      reserveSlugInTransaction(db, 'post', 'hello', 1, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).not.toThrow()
  })

  it('uses page wording for own-page collisions', () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta({ id: 99 })

    expect(() =>
      reserveSlugInTransaction(db, 'page', 'about', 1, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).toThrow('slug "about" 已被其它页面占用。')
  })
})
