import type { Comments as CommentsData } from '@kobato/contracts/comments.ts'

import { makeComment } from '@kobato/contracts/tests/utils/catalog.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render.tsx'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { Comments } from '@kobato/web-public/ui/comments/Comments.tsx'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

mockTanstackQuery()

const loader = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('@kobato/web-client/editor/inkling-labels.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/web-client/editor/inkling-labels.ts')>()
  return { ...actual, loadInklingLabels: loader.load }
})

vi.mock('@kobato/web-public/ui/comments/CommentBodyEditor.tsx', () => ({
  CommentBodyEditor: ({ labels }: { labels?: Record<string, string> }) => (
    <div data-testid="composer" contentEditable suppressContentEditableWarning>
      {labels?.['placeholder.editor'] ?? 'english-defaults'}
    </div>
  ),
}))

const commentsData: CommentsData = { count: 2, roots_count: 1 }

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

    expect(screen.queryByTestId('composer')).toBeNull()

    fireEvent.click(screen.getAllByText('回复')[1])

    const composer = await waitFor(() => screen.getByTestId('composer'))
    const target = document.getElementById('user-comment-2')!
    const respond = document.getElementById('respond')!
    expect(target.parentElement!.contains(respond)).toBe(true)
    expect(document.querySelectorAll('#respond')).toHaveLength(1)

    expect(document.activeElement).toBe(composer)
    expect(loader.load).toHaveBeenCalledWith('zh-CN')
  })

  it('keeps the top-level form interaction-gated while no reply target is active', () => {
    renderComments()

    const respond = document.getElementById('respond')!
    expect(document.getElementById('user-comment-1')!.contains(respond)).toBe(false)
    expect(screen.queryByTestId('composer')).toBeNull()
  })
})
