// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'

vi.mock('@/ui/admin/shell/AdminShell', () => ({
  useAdminScrollTopLift: vi.fn(),
}))

let viewportWidth = 1280

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query === '(min-width: 1024px)'
          ? viewportWidth >= 1024
          : query === '(max-width: 767px)'
            ? viewportWidth <= 767
            : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEditorShellLayout', () => {
  it.each([
    { width: 1280, isLg: true, label: 'desktop' },
    { width: 800, isLg: false, label: 'tablet' },
  ])('opens the metadata panel by default on $label', ({ width, isLg }) => {
    viewportWidth = width
    const { result } = renderHook(() => useEditorShellLayout())

    expect(result.current.metaOpen).toBe(true)
    expect(result.current.isLg).toBe(isLg)
  })

  it('collapses the metadata panel by default only on mobile', () => {
    viewportWidth = 390
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useEditorShellLayout())

    expect(result.current.metaOpen).toBe(false)
    expect(result.current.isLg).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
  })
})
