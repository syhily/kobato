import { describe, expect, it, vi } from 'vitest'

import type { MyCommentItem } from '@/routes/admin/me/comments'

import { inklingParagraph } from '#/_helpers/inkling'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'
import { MyEditCommentDialog } from '@/ui/admin/my/MyEditCommentDialog'

vi.mock('@/ui/public/comments/CommentBodyEditor', () => ({
  CommentBodyEditor: () => <div data-testid="comment-body-editor">CommentBodyEditor</div>,
}))

function makeCommentBody(text: string) {
  return inklingParagraph(text)
}

function makeMyCommentItem(overrides: Partial<MyCommentItem> = {}): MyCommentItem {
  return {
    id: overrides.id ?? 'comment-1',
    body: overrides.body ?? makeCommentBody('Hello'),
    createdAtIso: overrides.createdAtIso ?? '2024-01-01T00:00:00.000Z',
    deletedAtIso: overrides.deletedAtIso ?? null,
    deleteRequestedAtIso: overrides.deleteRequestedAtIso ?? null,
    isPending: overrides.isPending ?? false,
    entity: overrides.entity ?? { title: 'Post One', permalink: '/posts/one' },
    parent: overrides.parent ?? null,
  }
}

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
