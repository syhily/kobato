// @vitest-environment happy-dom

import { renderHook } from '@kobato/ui/tests/utils/hook.tsx'
import { useFocusHash } from '@kobato/web-client/hooks/use-focus-hash.ts'
import { getCommentFlashSnapshot } from '@kobato/web-client/lib/comment-flash.ts'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

function FocusHashProbe() {
  useFocusHash()
  return null
}

describe('useFocusHash', () => {
  it('renders without error when no hash is present', () => {
    expect(() => renderHook(() => useFocusHash())).not.toThrow()
  })

  it('renders without error when a hash is present', () => {
    expect(() => renderHook(() => useFocusHash(), { initialPath: '/#section' })).not.toThrow()
  })

  it('flashes the comment store instead of mutating the DOM when the hash targets a comment', () => {
    const target = document.createElement('div')
    target.id = 'user-comment-9865'
    document.body.append(target)
    try {
      const router = createMemoryRouter([{ path: '*', element: <FocusHashProbe /> }], {
        initialEntries: ['/posts/x#user-comment-9865'],
      })
      render(<RouterProvider router={router} />)
      expect(getCommentFlashSnapshot()).toBe('9865')
    } finally {
      target.remove()
    }
  })
})
