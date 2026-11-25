// @vitest-environment happy-dom

import { renderHook } from '@kobato/ui/tests/utils/hook'
import { describe, expect, it } from 'vitest'

import { useDetachPublicCss } from '@/document/use-detach-public-css'

describe('useDetachPublicCss', () => {
  it('renders without error when document is undefined', () => {
    expect(() => renderHook(() => useDetachPublicCss())).not.toThrow()
  })
})
