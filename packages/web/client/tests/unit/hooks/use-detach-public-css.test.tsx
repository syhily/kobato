import { renderHook } from '@kobato/ui/tests/utils/hook'
import { useDetachPublicCss } from '@kobato/web-client/hooks/use-detach-public-css'
import { describe, expect, it } from 'vitest'

describe('useDetachPublicCss', () => {
  it('renders without error when document is undefined', () => {
    expect(() => renderHook(() => useDetachPublicCss())).not.toThrow()
  })
})
