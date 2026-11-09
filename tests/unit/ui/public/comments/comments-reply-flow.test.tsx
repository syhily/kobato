// @vitest-environment happy-dom
/**
 * Clicking 回复 on a comment (the PC flow): the reply form moves under the
 * target comment AND lands with the composer eagerly mounted and focused —
 * no second click on an inert placeholder. The top-level form stays
 * interaction-gated. (The mobile zoom-lock choreography around this handoff
 * is pinned separately in lazy-comment-body-editor.test.tsx.)
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Comments as CommentsData } from '@/shared/types/comments'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { makeComment } from '#/_helpers/catalog'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { Comments } from '@/ui/public/comments/Comments'

mockTanstackQuery()

const loader = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('@/client/editor/inkling-labels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/client/editor/inkling-labels')>()
  return { ...actual, loadInklingLabels: loader.load }
})

vi.mock('@/ui/public/comments/CommentBodyEditor', () => ({
  CommentBodyEditor: ({ labels }: { labels?: Record<string, string> }) => (
    <div data-testid="composer" contentEditable suppressContentEditableWarning>
      {labels?.['placeholder.editor'] ?? 'english-defaults'}
    </div>
  ),
}))

const commentsData: CommentsData = { comments: [], count: 2, roots_count: 1 }

const child = makeComment({ id: '2', rid: 1, rootId: '1', name: 'Bob', userId: '11' })
const items = [makeComment({ id: '1', name: 'Alice', userId: '10', children: [child] })]

function renderComments() {
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '*',
        element: wrapWithI18n(
          <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
            <Comments commentKey="/posts/hello" comments={commentsData} items={items} />
          </BlogSettingsProvider>,
          { locale: 'zh-CN' },
        ),
      },
    ],
    { hydrationData: { loaderData: { root: {} } } },
  )
  return render(<RouterProvider router={router} />)
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  loader.load.mockReset()
  loader.load.mockImplementation(async (locale: string) => ({ 'placeholder.editor': `${locale} labels` }))
})

describe('Comments — clicking 回复 activates the inline composer', () => {
  it('mounts the reply form under the target comment, eager and focused', async () => {
    renderComments()

    // Top-level form is interaction-gated: placeholder, no composer yet.
    expect(screen.queryByTestId('composer')).toBeNull()

    // The second 回复 button belongs to the nested comment (id 2).
    fireEvent.click(screen.getAllByText('回复')[1])

    const composer = await waitFor(() => screen.getByTestId('composer'))
    // The form moved under the target's thread (inside the root comment's
    // subtree, right after the nested target row) — one #respond in total.
    const target = document.getElementById('user-comment-2')!
    const respond = document.getElementById('respond')!
    expect(target.parentElement!.contains(respond)).toBe(true)
    expect(document.querySelectorAll('#respond')).toHaveLength(1)

    // The composer landed ready for input.
    expect(document.activeElement).toBe(composer)
    expect(loader.load).toHaveBeenCalledWith('zh-CN')
  })

  it('keeps the top-level form interaction-gated while no reply target is active', () => {
    renderComments()

    const respond = document.getElementById('respond')!
    // Outside the comment list — the form sits above it, placeholder-gated.
    expect(document.getElementById('user-comment-1')!.contains(respond)).toBe(false)
    expect(screen.queryByTestId('composer')).toBeNull()
  })
})
