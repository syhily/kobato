// @vitest-environment happy-dom

// Coverage for usePostsFilters, mirroring what the retired usePostsReducer
// specs asserted:
//   - URL search-param initialization (status / tag / category),
//   - the deriveStatusFields mapping for all five status values,
//   - the URL→state sync effects not clobbering user-changed fields.
//
// The SSR runner (tests/_helpers/hook.tsx) covers initialization without
// effects; the happy-dom mounts flush the URL→state sync effects.

import { act, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { deriveStatusFields, type PostStatusFilter, usePostsFilters } from '@/ui/admin/posts/usePostsFilters'

describe('ui/admin/posts/usePostsFilters — initialization', () => {
  it('derives an empty search into the default filters', () => {
    const { filters } = renderHook(usePostsFilters)
    expect(filters.status).toBe('all')
    expect(filters.category).toBe('')
    expect(filters.tag).toBe('')
    expect(filters.authorId).toBe('')
    expect(filters.sortBy).toBe('publishedAt')
    expect(filters.sortOrder).toBe('desc')
  })

  it('reads status, category and tag from the URL', () => {
    const { filters } = renderHook(usePostsFilters, {
      initialPath: '/?status=published&category=tech&tag=react',
    })
    expect(filters.status).toBe('published')
    expect(filters.category).toBe('tech')
    expect(filters.tag).toBe('react')
  })

  it.each(['all', 'published', 'draft', 'hidden', 'deleted'] satisfies PostStatusFilter[])(
    'accepts the %s status from the URL',
    (status) => {
      const { filters } = renderHook(usePostsFilters, { initialPath: `/?status=${status}` })
      expect(filters.status).toBe(status)
    },
  )

  it('ignores unknown status values', () => {
    const { filters } = renderHook(usePostsFilters, { initialPath: '/?status=unknown' })
    expect(filters.status).toBe('all')
  })
})

describe('ui/admin/posts/deriveStatusFields', () => {
  it('maps all to the normal (unfiltered) flags', () => {
    expect(deriveStatusFields('all')).toEqual({ deletedStatus: 'normal' })
  })

  it('maps published to published + visible', () => {
    expect(deriveStatusFields('published')).toEqual({ deletedStatus: 'normal', published: true, visible: true })
  })

  it('maps draft to unpublished', () => {
    expect(deriveStatusFields('draft')).toEqual({ deletedStatus: 'normal', published: false })
  })

  it('maps hidden to published + invisible', () => {
    expect(deriveStatusFields('hidden')).toEqual({ deletedStatus: 'normal', published: true, visible: false })
  })

  it('maps deleted to the deleted flag only', () => {
    expect(deriveStatusFields('deleted')).toEqual({ deletedStatus: 'deleted' })
  })
})

// ───────────────── URL→state sync (effects must flush) ─────────────────

interface HarnessHandle {
  current: ReturnType<typeof usePostsFilters> | null
}

function mountFilters(initialPath: string = '/'): {
  handle: HarnessHandle
  router: ReturnType<typeof createMemoryRouter>
} {
  const handle: HarnessHandle = { current: null }

  function Harness() {
    handle.current = usePostsFilters()
    return null
  }

  const routes: RouteObject[] = [{ path: '*', element: <Harness /> }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  render(<RouterProvider router={router} />)
  return { handle, router }
}

describe('ui/admin/posts/usePostsFilters — URL→state sync', () => {
  it('keeps a user-selected status after effects flush', async () => {
    const { handle } = mountFilters()

    expect(handle.current).not.toBeNull()
    act(() => {
      handle.current!.setStatus('draft')
    })

    await waitFor(() => {
      expect(handle.current!.filters.status).toBe('draft')
    })
  })

  it('keeps a user-selected category and tag after effects flush', async () => {
    const { handle } = mountFilters()

    act(() => {
      handle.current!.setCategory('life')
      handle.current!.setTag('react')
    })

    await waitFor(() => {
      expect(handle.current!.filters.category).toBe('life')
      expect(handle.current!.filters.tag).toBe('react')
    })
  })

  it('syncs status from a URL change without clobbering other user-changed fields', async () => {
    const { handle, router } = mountFilters('/?status=published&tag=react')

    expect(handle.current!.filters.status).toBe('published')

    act(() => {
      handle.current!.setAuthorId('user-1')
      handle.current!.setSortBy('updatedAt')
      handle.current!.setSortOrder('asc')
    })

    await act(async () => {
      await router.navigate('/?status=draft&tag=vitest')
    })

    await waitFor(() => {
      expect(handle.current!.filters.status).toBe('draft')
      expect(handle.current!.filters.tag).toBe('vitest')
    })
    // Fields with no URL param keep the user's selection.
    expect(handle.current!.filters.authorId).toBe('user-1')
    expect(handle.current!.filters.sortBy).toBe('updatedAt')
    expect(handle.current!.filters.sortOrder).toBe('asc')
  })
})
