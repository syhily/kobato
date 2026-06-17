import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useMediumZoom } from '@/client/hooks/use-medium-zoom'

describe('useMediumZoom', () => {
  it('renders without error when container ref is null', () => {
    expect(() => renderHook(() => useMediumZoom({ current: null }))).not.toThrow()
  })
})
