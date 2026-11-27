// @vitest-environment happy-dom

import { makeComment } from '@kobato/api/tests/utils/catalog'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { BlogSettingsProvider } from '@kobato/ui/lib/blog-settings-context'
import { renderWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { makeLeafContext } from '@sayaka/tests/utils/comments-leaf'
import { flashCommentTarget, getCommentFlashSnapshot } from '@sayaka/ui/comments/comment-item/comment-flash'
import { CommentRow } from '@sayaka/ui/comments/comment-item/CommentRow'
import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

mockTanstackQuery()

function renderRow() {
  const LeafContext = makeLeafContext()
  return renderWithI18n(
    <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
      <LeafContext>
        <CommentRow comment={makeComment({ id: '42' })} depth={1} />
      </LeafContext>
    </BlogSettingsProvider>,
  )
}

function article(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('article.comment-body')
  expect(el).not.toBeNull()
  return el!
}

describe('CommentRow flash class', () => {
  it('renders without the flash class and gains it only when the store flashes its id', () => {
    const { container } = renderRow()
    expect(article(container).className).not.toContain('active')

    act(() => {
      flashCommentTarget('42')
    })
    expect(article(container).className).toContain('active')

    act(() => {
      flashCommentTarget('other')
    })
    expect(article(container).className).not.toContain('active')
    expect(getCommentFlashSnapshot()).toBe('other')
  })
})
