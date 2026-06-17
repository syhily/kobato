import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useFocusHash } from '@/client/hooks/use-focus-hash'

describe('useFocusHash', () => {
  it('renders without error when no hash is present', () => {
    expect(() => renderHook(() => useFocusHash())).not.toThrow()
  })

  it('renders without error when a hash is present', () => {
    expect(() => renderHook(() => useFocusHash(), { initialPath: '/#section' })).not.toThrow()
  })
})
