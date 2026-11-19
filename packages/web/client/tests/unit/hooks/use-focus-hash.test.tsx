import { useFocusHash } from '@kobato/web-client/hooks/use-focus-hash.ts'
import { renderHook } from '@kobato/web-client/tests/utils/hook.tsx'
import { describe, expect, it } from 'vitest'

describe('useFocusHash', () => {
  it('renders without error when no hash is present', () => {
    expect(() => renderHook(() => useFocusHash())).not.toThrow()
  })

  it('renders without error when a hash is present', () => {
    expect(() => renderHook(() => useFocusHash(), { initialPath: '/#section' })).not.toThrow()
  })
})
