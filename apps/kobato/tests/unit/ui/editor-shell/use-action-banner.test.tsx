// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useActionBanner } from '@/ui/editor-shell/use-action-banner'

describe('ui/admin/editor-shell/useActionBanner', () => {
  it('shows the banner with the slug only after every armed leg lands', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.begin('draft', 2))
    act(() => result.current.noteLeg('hello-world'))
    expect(result.current.banner).toBeNull()

    act(() => result.current.noteLeg('hello-world'))
    expect(result.current.banner).toEqual({ kind: 'draft', slug: 'hello-world' })
  })

  it('shows a single-leg banner on the first noteLeg', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.begin('published', 1))
    act(() => result.current.noteLeg('slug-1'))
    expect(result.current.banner).toEqual({ kind: 'published', slug: 'slug-1' })
  })

  it('cancel mid-count drops the pending banner for good', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.begin('draft', 2))
    act(() => result.current.noteLeg('hello-world'))
    act(() => result.current.cancel())
    act(() => result.current.noteLeg('hello-world'))
    expect(result.current.banner).toBeNull()
  })

  it('noteLeg without a pending countdown is a no-op', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.noteLeg('hello-world'))
    expect(result.current.banner).toBeNull()
  })

  it('dismiss hides the visible banner', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.begin('published', 1))
    act(() => result.current.noteLeg('slug-1'))
    expect(result.current.banner).not.toBeNull()

    act(() => result.current.dismiss())
    expect(result.current.banner).toBeNull()
  })

  it('begin re-arms over a pending countdown', () => {
    const { result } = renderHook(() => useActionBanner())

    act(() => result.current.begin('draft', 2))
    act(() => result.current.begin('published', 1))
    act(() => result.current.noteLeg('slug-2'))
    expect(result.current.banner).toEqual({ kind: 'published', slug: 'slug-2' })
  })
})
