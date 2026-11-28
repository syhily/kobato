// @vitest-environment happy-dom

import { renderHook } from '@kobato/ui/tests/utils/hook'
import { describe, expect, it } from 'vitest'

import { useReloadOnChunkError } from '@/document/use-chunk-error-recovery'

describe('document/use-chunk-error-recovery — useReloadOnChunkError', () => {
  it('returns undefined for a chunk-load error', () => {
    const result = renderHook(() => useReloadOnChunkError(new Error('Loading chunk 5 failed.')))
    expect(result).toBeUndefined()
  })

  it('returns undefined for a non-chunk error', () => {
    const result = renderHook(() => useReloadOnChunkError(new Error('unrelated')))
    expect(result).toBeUndefined()
  })

  it('returns undefined for a null error', () => {
    const result = renderHook(() => useReloadOnChunkError(null))
    expect(result).toBeUndefined()
  })
})
