import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SlugRegistryRow } from '@/server/infra/db/schema/config'

import { findSlugRegistryBySlugForUpdate } from '@/server/infra/db/operations/slug-registry'
import { DomainError } from '@/server/infra/http/errors'
import { reserveSlugInTransaction } from '@/server/infra/slug/reservation'

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  findSlugRegistryBySlugForUpdate: vi.fn(),
}))

const db = {} as unknown as NodePgDatabase

function mockFindOwnMeta(result: { id: bigint } | null) {
  return vi.fn(async () => result)
}

function registryRow(
  overrides: Partial<SlugRegistryRow> & { slug: string; entityType: 'post' | 'page'; entityId: bigint },
): SlugRegistryRow {
  const now = overrides.createdAt ?? new Date('2026-06-16T00:00:00.000Z')
  return {
    id: overrides.id ?? 1n,
    slug: overrides.slug,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    createdAt: now,
  }
}

function setRegistryMock(value: SlugRegistryRow | null) {
  vi.mocked(
    findSlugRegistryBySlugForUpdate as unknown as (tx: NodePgDatabase, slug: string) => Promise<SlugRegistryRow | null>,
  ).mockResolvedValue(value)
}

describe('reserveSlugInTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows the slug when no own meta and no registry entry exists', async () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta(null)

    await expect(
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).resolves.toBeUndefined()

    expect(findOwnMeta).toHaveBeenCalledWith(db, 'hello')
    expect(findSlugRegistryBySlugForUpdate).toHaveBeenCalledWith(db, 'hello')
  })

  it('throws CONFLICT when another own entity has the same slug', async () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta({ id: 99n })

    await expect(
      reserveSlugInTransaction(db, 'post', 'hello', 1n, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'slug "hello" 已被其它文章占用。',
    })
  })

  it('throws CONFLICT when a different entity type holds the slug', async () => {
    setRegistryMock(registryRow({ slug: 'hello', entityType: 'page', entityId: 42n }))
    const findOwnMeta = mockFindOwnMeta(null)

    await expect(
      reserveSlugInTransaction(db, 'post', 'hello', undefined, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'slug "hello" 已被其它页面占用。',
    })
  })

  it('allows updating the same entity with its existing slug', async () => {
    setRegistryMock(registryRow({ slug: 'hello', entityType: 'post', entityId: 1n }))
    const findOwnMeta = mockFindOwnMeta({ id: 1n })

    await expect(
      reserveSlugInTransaction(db, 'post', 'hello', 1n, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).resolves.toBeUndefined()
  })

  it('uses page wording for own-page collisions', async () => {
    setRegistryMock(null)
    const findOwnMeta = mockFindOwnMeta({ id: 99n })

    await expect(
      reserveSlugInTransaction(db, 'page', 'about', 1n, {
        findOwnMetaBySlugForUpdate: findOwnMeta,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'slug "about" 已被其它页面占用。',
    })
  })
})
