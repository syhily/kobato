// @vitest-environment happy-dom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeComment } from '#/_helpers/catalog'
import { CommentAvatar } from '@/ui/public/comments/comment-item/CommentAuthorLine'

function renderAvatar() {
  return render(<CommentAvatar comment={makeComment({ userId: '42' })} depth={1} />)
}

function skeleton(container: HTMLElement) {
  return container.querySelector('[data-slot="avatar-skeleton"]')
}

describe('CommentAvatar loading state', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a skeleton until the avatar image loads', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    const { container } = renderAvatar()
    expect(skeleton(container)).not.toBeNull()

    fireEvent.load(container.querySelector('img')!)
    expect(skeleton(container)).toBeNull()
  })

  it('removes the skeleton when the image errors so the default avatar shows', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    const { container } = renderAvatar()
    expect(skeleton(container)).not.toBeNull()

    fireEvent.error(container.querySelector('img')!)
    expect(skeleton(container)).toBeNull()
  })

  it('skips the skeleton when the image already finished loading before hydration', () => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(40)
    const { container } = renderAvatar()
    expect(skeleton(container)).toBeNull()
  })
})
