import { renderHook } from '#/_helpers/hook'

import { useMediumZoom } from '@kobato/client/hooks/use-medium-zoom'
import { describe, expect, it } from 'vitest'

describe('useMediumZoom', () => {
  it('renders without error when container ref is null', () => {
    expect(() => renderHook(() => useMediumZoom({ current: null }))).not.toThrow()
  })
})
