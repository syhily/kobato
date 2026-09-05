import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreviewLease } from '@/hooks/usePreviewLease'

describe('usePreviewLease', () => {
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

  it('leases a url for a blob and exposes it as state', () => {
    const { result } = renderHook(() => usePreviewLease())
    const blob = new Blob(['a'])

    expect(result.current[0]).toBe('')

    act(() => {
      result.current[1](blob)
    })

    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(blob)
    expect(result.current[0]).toBe('blob:preview-1')
  })

  it('releases the previous lease when the preview is replaced or cleared', () => {
    const { result } = renderHook(() => usePreviewLease())

    act(() => {
      result.current[1](new Blob(['a']))
    })
    act(() => {
      result.current[1](new Blob(['b']))
    })

    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview-1')
    expect(result.current[0]).toBe('blob:preview-2')

    act(() => {
      result.current[1](null)
    })

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:preview-2')
    expect(result.current[0]).toBe('')
  })

  it('releases the held lease on unmount', () => {
    const { result, unmount } = renderHook(() => usePreviewLease())

    act(() => {
      result.current[1](new Blob(['a']))
    })

    unmount()

    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:preview-1')
  })
})
