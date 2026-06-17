import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useIsActiveLink } from '@/ui/admin/shell/use-is-active-link'

describe('ui/admin/shell/use-is-active-link', () => {
  it('matches an exact path', () => {
    const active = renderHook(() => useIsActiveLink('/admin/posts'), {
      initialPath: '/admin/posts',
    })
    expect(active).toBe(true)
  })

  it('does not match a different path', () => {
    const active = renderHook(() => useIsActiveLink('/admin/posts'), {
      initialPath: '/admin/comments',
    })
    expect(active).toBe(false)
  })

  it('matches a path with required search params', () => {
    const active = renderHook(() => useIsActiveLink('/admin/posts?status=draft'), {
      initialPath: '/admin/posts?status=draft',
    })
    expect(active).toBe(true)
  })

  it('rejects when a required search param differs', () => {
    const active = renderHook(() => useIsActiveLink('/admin/posts?status=draft'), {
      initialPath: '/admin/posts?status=published',
    })
    expect(active).toBe(false)
  })

  it('rejects exact links when extra search params are present', () => {
    const active = renderHook(() => useIsActiveLink('/admin/posts', false, true), {
      initialPath: '/admin/posts?status=draft',
    })
    expect(active).toBe(false)
  })

  it('matches subpaths when activeOnSubpath is true', () => {
    const active = renderHook(() => useIsActiveLink('/admin', true), {
      initialPath: '/admin/posts',
    })
    expect(active).toBe(true)
  })

  it('does not match subpaths when end is true and activeOnSubpath is false', () => {
    const active = renderHook(() => useIsActiveLink('/admin', false, true), {
      initialPath: '/admin/posts',
    })
    expect(active).toBe(false)
  })

  it('matches subpaths with activeOnSubpath even when end is true', () => {
    const active = renderHook(() => useIsActiveLink('/admin', true, true), {
      initialPath: '/admin/posts',
    })
    expect(active).toBe(true)
  })
})
