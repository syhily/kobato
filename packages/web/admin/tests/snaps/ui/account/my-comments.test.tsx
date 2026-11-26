import { MyCommentsView } from '@kobato/web-admin/ui/account/MyCommentsView'
import { MyEditCommentDialog } from '@kobato/web-admin/ui/account/MyEditCommentDialog'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/web-kit/ui/comments/LazyCommentBodyEditor', () => ({
  LazyCommentBodyEditor: () => <div data-testid="comment-body-editor">CommentBodyEditor</div>,
}))

const currentUser = { id: 'user-1', name: 'Alice', email: 'alice@example.com' }

describe('snapshot: MyCommentsView', () => {
  it('renders initial loading state', () => {
    const html = stableHtml(
      renderInRouter(
        <MyCommentsView status="all" q="" entity={null} entityOptions={[]} currentUser={currentUser} />,
        '/admin/me/comments',
      ),
    )
    expect(html).toContain('我的评论')
    expect(html).toContain('共')
    expect(html).toContain('条评论')
    expect(html).toContain('skeleton')
  })

  it('renders active filters', () => {
    const html = stableHtml(
      renderInRouter(
        <MyCommentsView
          status="pending"
          q="hello"
          entity="post:1"
          entityOptions={[{ value: 'post:1', label: 'Post One' }]}
          currentUser={currentUser}
        />,
        '/admin/me/comments?status=pending&q=hello&entity=post:1',
      ),
    )
    expect(html).toContain('我的评论')
    expect(html).toContain('待审')
    expect(html).toContain('Post One')
    expect(html).toContain('hello')
  })
})

describe('snapshot: MyEditCommentDialog', () => {
  it('renders closed', () => {
    const html = stableHtml(renderToHtml(<MyEditCommentDialog target={null} onClose={() => {}} onSaved={() => {}} />))
    expect(html).toBe('')
  })
})
