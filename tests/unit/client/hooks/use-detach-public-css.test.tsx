import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'

describe('useDetachPublicCss', () => {
  it('renders without error when document is undefined', () => {
    expect(() => renderHook(() => useDetachPublicCss())).not.toThrow()
  })
})
