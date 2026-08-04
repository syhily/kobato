import { renderHook } from '#/_helpers/hook'

import { useFocusHash } from '@kobato/client/hooks/use-focus-hash'
import { describe, expect, it } from 'vitest'

describe('useFocusHash', () => {
  it('renders without error when no hash is present', () => {
    expect(() => renderHook(() => useFocusHash())).not.toThrow()
  })

  it('renders without error when a hash is present', () => {
    expect(() => renderHook(() => useFocusHash(), { initialPath: '/#section' })).not.toThrow()
  })
})
