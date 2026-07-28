import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  findSlugRegistryBySlugForUpdate: vi.fn(),
  insertSlugRegistry: vi.fn(),
}))

const tx = {} as Database

function registryRow(entityType: 'post' | 'page', entityId: number) {
  return { id: 9, slug: 'hello', entityType, entityId, createdAt: new Date() }
}

function uniqueViolation(failed: string): Error {
  return Object.assign(new Error(`UNIQUE constraint failed: ${failed}`), { errcode: 2067 })
}

describe('reclaimSlugOnRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findSlugRegistryBySlugForUpdate).mockReturnValue(null as never)
    vi.mocked(insertSlugRegistry).mockReturnValue(registryRow('post', 1))
  })

  it('reclaims a free slug and returns no warning', async () => {
    const warning = reclaimSlugOnRestore(tx, 'post', 1, 'hello')

    expect(warning).toBeUndefined()
    expect(insertSlugRegistry).toHaveBeenCalledWith(tx, { slug: 'hello', entityType: 'post', entityId: 1 })
  })

  it('still attempts the insert when the row is already owned by the restoring entity', async () => {
    vi.mocked(findSlugRegistryBySlugForUpdate).mockReturnValue(registryRow('page', 7))

    const warning = reclaimSlugOnRestore(tx, 'page', 7, 'hello')

    expect(warning).toBeUndefined()
    expect(insertSlugRegistry).toHaveBeenCalledWith(tx, { slug: 'hello', entityType: 'page', entityId: 7 })
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
      vi.mocked(findSlugRegistryBySlugForUpdate).mockReturnValue(registryRow(owner, 2))

      const warning = reclaimSlugOnRestore(tx, restoring, 1, 'hello')

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
    vi.mocked(insertSlugRegistry).mockImplementation(() => {
      throw uniqueViolation('uq_slug_registry_slug')
    })

    const warning = reclaimSlugOnRestore(tx, restoring, 1, 'hello')

    expect(warning).toBe(message)
  })

  it('rethrows a unique violation from a different constraint', async () => {
    vi.mocked(insertSlugRegistry).mockImplementation(() => {
      throw uniqueViolation('some_other_constraint')
    })

    expect(() => reclaimSlugOnRestore(tx, 'post', 1, 'hello')).toThrow('UNIQUE constraint failed')
  })

  it('rethrows non-unique insert errors', async () => {
    vi.mocked(insertSlugRegistry).mockImplementation(() => {
      throw new Error('connection lost')
    })

    expect(() => reclaimSlugOnRestore(tx, 'page', 1, 'hello')).toThrow('connection lost')
  })
})
