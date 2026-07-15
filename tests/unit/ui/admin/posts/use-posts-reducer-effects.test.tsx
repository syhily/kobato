// @vitest-environment happy-dom

// Regression tests for the URL→state sync effects in usePostsReducer.
//
// The default hook runner (tests/_helpers/hook.tsx) renders via
// renderToStaticMarkup, so useEffect never runs and these sync effects were
// never covered. That is exactly why the bug slipped through: when the user
// picks a filter in the UI (dispatch setStatus/setCategory/setTag), the
// URL-sync effect runs on the next commit, reads the *unchanged* URL, sees a
// mismatch, and dispatches the value straight back to the URL-derived default
// — silently swallowing the user's selection. These tests mount the hook in a
// real DOM environment so the effects flush, then assert the user's dispatch
// survives.

import { act, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import { usePostsReducer } from '@/ui/admin/posts/usePostsReducer'

interface HarnessHandle {
  current: {
    state: ReturnType<typeof usePostsReducer>['state']
    dispatch: ReturnType<typeof usePostsReducer>['dispatch']
  } | null
}

function mountController(initialPath: string = '/'): HarnessHandle {
  const handle: HarnessHandle = { current: null }

  function Harness() {
    const controller = usePostsReducer()
    handle.current = controller
    return null
  }

  const routes: RouteObject[] = [{ path: '*', element: <Harness /> }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  render(<RouterProvider router={router} />)
  return handle
}

describe('usePostsReducer — URL→state sync does not clobber user filters', () => {
  it('keeps a user-selected status after effects flush', async () => {
    const handle = mountController()

    expect(handle.current).not.toBeNull()
    act(() => {
      handle.current!.dispatch({ type: 'setStatus', value: 'draft' })
    })

    await waitFor(() => {
      expect(handle.current!.state.status).toBe('draft')
      expect(handle.current!.state.published).toBe(false)
    })
  })

  it('keeps a user-selected category after effects flush', async () => {
    const handle = mountController()

    act(() => {
      handle.current!.dispatch({ type: 'setCategory', value: 'life' })
    })

    await waitFor(() => {
      expect(handle.current!.state.category).toBe('life')
    })
  })

  it('keeps a user-selected tag after effects flush', async () => {
    const handle = mountController()

    act(() => {
      handle.current!.dispatch({ type: 'setTag', value: 'react' })
    })

    await waitFor(() => {
      expect(handle.current!.state.tag).toBe('react')
    })
  })
})
