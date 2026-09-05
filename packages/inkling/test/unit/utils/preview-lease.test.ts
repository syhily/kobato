import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPreviewLease, createPreviewLeasePool } from '@/utils/preview-lease'

describe('createPreviewLease', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL and revokes it on release', () => {
    const blob = new Blob(['x'])
    const lease = createPreviewLease(blob)

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(blob)
    expect(lease.url).toBe('blob:preview')

    lease.release()
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview')
  })

  it('releases idempotently', () => {
    const lease = createPreviewLease(new Blob(['x']))

    lease.release()
    lease.release()

    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1)
  })
})

describe('createPreviewLeasePool', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
  let leaseCount: number

  beforeEach(() => {
    leaseCount = 0
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockImplementation(() => {
      leaseCount += 1
      return `blob:preview-${leaseCount}`
    })
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('releases tracked urls individually and ignores unknown ones', () => {
    const pool = createPreviewLeasePool()
    const first = pool.lease(new Blob(['a']))
    const second = pool.lease(new Blob(['b']))

    pool.release(first)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith(first)

    pool.release(first)
    pool.release('blob:not-tracked')
    pool.release(null)
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1)

    pool.release(second)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(second)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(2)
  })

  it('releases everything on releaseAll', () => {
    const pool = createPreviewLeasePool()
    const first = pool.lease(new Blob(['a']))
    const second = pool.lease(new Blob(['b']))

    pool.releaseAll()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(first)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(second)
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2)
  })
})
