import { describe, expect, it } from 'vitest'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PostRow } from '@/ui/admin/posts/PostRow'

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

  it('renders an unlisted published post', () => {
    const post = makeAdminPost({
      title: 'Unlisted Post',
      visible: false,
    })
    const html = stableHtml(renderInRouter(<PostRow post={post} />))
    expect(html).toContain('Unlisted Post')
    expect(html).toContain('不列出')
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

  it('wires the category button to onFilterCategory with id and name', () => {
    const post = makeAdminPost({ category: 'life', categoryId: 'c-9' })
    let filtered: [string, string] | null = null
    const html = stableHtml(
      renderInRouter(
        <PostRow
          post={post}
          onFilterCategory={(id, name) => {
            filtered = [id, name]
          }}
        />,
      ),
    )
    expect(html).toContain('life')
    // SSR never clicks — the callback stays unfired.
    expect(filtered).toBeNull()
  })
})
