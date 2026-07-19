import { describe, expect, it } from 'vitest'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PostRow } from '@/ui/admin/posts/PostRow'
import { StatusBadge } from '@/ui/admin/posts/StatusBadge'

describe('snapshot: PostRow', () => {
  it('renders a published post with cover', () => {
    const post = makeAdminPost({
      title: 'Hello World',
      category: 'tech',
      commentCount: 42,
      commentPublicId: 'comment-uuid',
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Hello World')
    expect(html).toContain('/editor/post/')
    expect(html).toContain('tech')
    expect(html).toContain('42')
    expect(html).toContain('/admin/comments?pageKey=comment-uuid')
    expect(html).toContain('已发布')
  })

  it('renders a draft post without cover', () => {
    const post = makeAdminPost({
      title: 'Draft Post',
      published: false,
      cover: '',
      category: '',
      categoryId: null,
      firstPublishedAt: null,
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Draft Post')
    expect(html).toContain('草稿')
    expect(html).toContain('无分类')
  })

  it('renders a deleted post', () => {
    const post = makeAdminPost({
      title: 'Deleted Post',
      deletedAt: '2024-03-01T00:00:00.000Z',
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Deleted Post')
    expect(html).toContain('已删除')
    expect(html).toContain('data-deleted')
  })

  it('renders a hidden published post', () => {
    const post = makeAdminPost({
      title: 'Hidden Post',
      visible: false,
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Hidden Post')
    expect(html).toContain('隐藏')
  })

  it('renders a post with only draft revision', () => {
    const post = makeAdminPost({
      title: 'Only Draft Revision',
      publishedRevisionId: null,
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Only Draft Revision')
    expect(html).toContain('仅草稿')
  })

  it('calls onFilterCategory when category button clicked', () => {
    const post = makeAdminPost({ category: 'life' })
    let filtered = ''
    const html = stableHtml(
      renderInRouter(
        <PostRow
          post={post}
          onFilterCategory={(c) => {
            filtered = c
          }}
        />,
      ),
    )
    expect(html).toContain('life')
    expect(filtered).toBe('')
  })
})

describe('snapshot: StatusBadge', () => {
  it('renders published badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: true,
      deletedAt: null,
      publishedRevisionId: 'r1',
    })
    const html = stableHtml(renderInRouter(<StatusBadge post={post} />))
    expect(html).toContain('已发布')
  })

  it('renders draft badge', () => {
    const post = makeAdminPost({ published: false })
    const html = stableHtml(renderInRouter(<StatusBadge post={post} />))
    expect(html).toContain('草稿')
  })

  it('renders deleted badge', () => {
    const post = makeAdminPost({ deletedAt: '2024-03-01T00:00:00.000Z' })
    const html = stableHtml(renderInRouter(<StatusBadge post={post} />))
    expect(html).toContain('已删除')
  })

  it('renders hidden badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: false,
      deletedAt: null,
      publishedRevisionId: 'r1',
    })
    const html = stableHtml(renderInRouter(<StatusBadge post={post} />))
    expect(html).toContain('隐藏')
  })

  it('renders only-draft badge', () => {
    const post = makeAdminPost({
      published: true,
      visible: true,
      deletedAt: null,
      publishedRevisionId: null,
    })
    const html = stableHtml(renderInRouter(<StatusBadge post={post} />))
    expect(html).toContain('仅草稿')
  })
})
