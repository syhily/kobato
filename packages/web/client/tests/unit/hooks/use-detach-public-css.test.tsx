import { useDetachPublicCss } from '@kobato/web-client/hooks/use-detach-public-css.ts'
import { renderHook } from '@kobato/web-client/tests/utils/hook.tsx'
import { describe, expect, it } from 'vitest'

describe('useDetachPublicCss', () => {
  it('renders without error when document is undefined', () => {
    expect(() => renderHook(() => useDetachPublicCss())).not.toThrow()
  })
})
