import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DatabaseError } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  findSlugRegistryBySlugForUpdate: vi.fn(),
  insertSlugRegistry: vi.fn(),
}))

const tx = {} as NodePgDatabase

function registryRow(entityType: 'post' | 'page', entityId: bigint) {
  return { id: 9n, slug: 'hello', entityType, entityId, createdAt: new Date() }
}

function uniqueViolation(constraint: string): DatabaseError {
  return Object.assign(new DatabaseError('duplicate key value violates unique constraint', 0, 'error'), {
    code: '23505',
    constraint,
  })
}

describe('reclaimSlugOnRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findSlugRegistryBySlugForUpdate).mockResolvedValue(null as never)
    vi.mocked(insertSlugRegistry).mockResolvedValue(registryRow('post', 1n))
  })

  it('reclaims a free slug and returns no warning', async () => {
    const warning = await reclaimSlugOnRestore(tx, 'post', 1n, 'hello')

    expect(warning).toBeUndefined()
    expect(insertSlugRegistry).toHaveBeenCalledWith(tx, { slug: 'hello', entityType: 'post', entityId: 1n })
  })

  it('still attempts the insert when the row is already owned by the restoring entity', async () => {
    vi.mocked(findSlugRegistryBySlugForUpdate).mockResolvedValue(registryRow('page', 7n))

    const warning = await reclaimSlugOnRestore(tx, 'page', 7n, 'hello')

    expect(warning).toBeUndefined()
    expect(insertSlugRegistry).toHaveBeenCalledWith(tx, { slug: 'hello', entityType: 'page', entityId: 7n })
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
      vi.mocked(findSlugRegistryBySlugForUpdate).mockResolvedValue(registryRow(owner, 2n))

      const warning = await reclaimSlugOnRestore(tx, restoring, 1n, 'hello')

      expect(warning).toBe(message)
      expect(insertSlugRegistry).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      restoring: 'post' as const,
      message: 'slug "hello" 在恢复过程中被其它内容占用，URL 不会指向此文章。',
    },
    {
      restoring: 'page' as const,
      message: 'slug "hello" 在恢复过程中被其它内容占用，URL 不会指向此页面。',
    },
  ])('warns when a concurrent writer claims the slug mid-restore ($restoring)', async ({ restoring, message }) => {
    vi.mocked(insertSlugRegistry).mockRejectedValue(uniqueViolation('uq_slug_registry_slug'))

    const warning = await reclaimSlugOnRestore(tx, restoring, 1n, 'hello')

    expect(warning).toBe(message)
  })

  it('rethrows a unique violation from a different constraint', async () => {
    vi.mocked(insertSlugRegistry).mockRejectedValue(uniqueViolation('some_other_constraint'))

    await expect(reclaimSlugOnRestore(tx, 'post', 1n, 'hello')).rejects.toThrow('duplicate key value')
  })

  it('rethrows non-unique insert errors', async () => {
    vi.mocked(insertSlugRegistry).mockRejectedValue(new Error('connection lost'))

    await expect(reclaimSlugOnRestore(tx, 'page', 1n, 'hello')).rejects.toThrow('connection lost')
  })
})
