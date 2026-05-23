import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ClientPostWithMetadata } from '@/shared/types/catalog'

import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { Input } from '@/ui/components/input'
import { CodeBlock } from '@/ui/pt/blocks/CodeBlock'
import { Pagination } from '@/ui/public/post/Pagination'
import { PostListingBody, PostSquare } from '@/ui/public/post/PostListViews'
import { SearchBar } from '@/ui/public/Search'

import { makePost } from './_helpers/catalog'
import { renderInRouter } from './_helpers/render'

function withMetadata(post: ReturnType<typeof makePost>): ClientPostWithMetadata {
  return { ...post, meta: { likes: 5, views: 42, comments: 3 } }
}

// Snapshot a few high-leverage UI shells. These render pure components
// (no SSR loaders, no DB/Redis) so any DOM/markup drift surfaces as a
// PR diff. Real route snapshots would need to mock the entire catalog +
// session pipeline; we intentionally cover the smallest blast-radius
// pieces here.

describe('snapshot: Pagination', () => {
  it('dense (total = 4) at page 2', () => {
    const html = renderInRouter(<Pagination current={2} total={4} rootPath="/archives" />)
    expect(html).toContain('aria-label="文章"')
    expect(html).toContain('>1<')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>2<')
    expect(html).toContain('>3<')
  })

  it('windowed (total = 12) near the start', () => {
    const html = renderInRouter(<Pagination current={2} total={12} rootPath="/archives" />)
    expect(html).toContain('>1<')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>2<')
    expect(html).toContain('>3<')
    expect(html).toContain('更多')
  })

  it('windowed (total = 12) in the middle', () => {
    const html = renderInRouter(<Pagination current={6} total={12} rootPath="/archives" />)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>6<')
    expect(html).toContain('更多')
  })

  it('windowed (total = 12) near the end', () => {
    const html = renderInRouter(<Pagination current={11} total={12} rootPath="/archives" />)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>11<')
    expect(html).toContain('>12<')
    expect(html).toContain('更多')
  })

  it('returns nothing when total <= 1', () => {
    const html = renderToStaticMarkup(<Pagination current={1} total={1} rootPath="/archives" />)
    expect(html).toBe('')
  })
})

describe('snapshot: SearchBar widget', () => {
  it('renders the sidebar search input', () => {
    const html = renderInRouter(<SearchBar />)
    expect(html).toContain('<form')
    expect(html).toContain('type="search"')
    expect(html).toContain('文章寻踪')
  })
})

describe('snapshot: SettingsRow', () => {
  it('wires invalid state to the shadcn field and the control', () => {
    const html = renderToStaticMarkup(
      <SettingsRow label="缓存前缀" htmlFor="cache-prefix" hint="必须以分隔符结尾。" error="前缀冲突">
        {(controlProps) => <Input id="cache-prefix" {...controlProps} />}
      </SettingsRow>,
    )

    expect(html).toContain('data-invalid="true"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('前缀冲突')
  })
})

describe('snapshot: CodeBlock', () => {
  it('renders a React-owned code header and copy button', () => {
    const html = renderToStaticMarkup(
      <CodeBlock className="shiki language-ts" tabIndex={0}>
        <code className="language-ts">
          <span className="line">
            <span>const answer = 42;</span>
          </span>
        </code>
      </CodeBlock>,
    )
    expect(html).toContain('code-block-wrapper')
    expect(html).toContain('TypeScript')
    expect(html).toContain('Copy')
    expect(html).toContain('const answer = 42;')
  })
})

describe('snapshot: PostListingBody (category/tag/search)', () => {
  it('renders the empty 404 state when no posts', () => {
    const html = renderToStaticMarkup(
      <PostListingBody
        title="标签：rust"
        description="描述"
        resolvedPosts={[]}
        pageNum={1}
        totalPage={0}
        rootPath="/tags/rust"
        alwaysRenderPagination={false}
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('404')
    expect(html).toContain('抱歉，没有你要找的内容')
  })

  it('renders a 2-post page with pagination', () => {
    const posts = [
      withMetadata(
        makePost({
          slug: 'first',
          title: 'First post',
          permalink: '/posts/first',
          date: new Date('2024-01-01T00:00:00.000Z'),
        }),
      ),
      withMetadata(
        makePost({
          slug: 'second',
          title: 'Second post',
          permalink: '/posts/second',
          date: new Date('2024-02-01T00:00:00.000Z'),
        }),
      ),
    ]
    const html = renderInRouter(
      <PostListingBody
        title="分类：技术"
        resolvedPosts={posts}
        pageNum={1}
        totalPage={3}
        rootPath="/cats/tech"
        listingNowIso="2026-04-25T12:00:00.000Z"
      />,
    )
    expect(html).toContain('First post')
    expect(html).toContain('Second post')
    expect(html).toContain('/posts/first')
    expect(html).toContain('/posts/second')
  })
})

describe('snapshot: PostSquare card', () => {
  it('renders the first/large variant', () => {
    const post = withMetadata(
      makePost({
        slug: 'card',
        title: 'Card title',
        permalink: '/posts/card',
        date: new Date('2024-03-01T00:00:00.000Z'),
      }),
    )
    const html = renderInRouter(<PostSquare post={post} first listingNowIso="2026-04-25T12:00:00.000Z" />)
    expect(html).toContain('Card title')
    expect(html).toContain('/posts/card')
  })

  it('renders the small variant', () => {
    const post = withMetadata(
      makePost({
        slug: 'card-2',
        title: 'Card 2',
        permalink: '/posts/card-2',
        date: new Date('2024-03-02T00:00:00.000Z'),
      }),
    )
    const html = renderInRouter(<PostSquare post={post} first={false} listingNowIso="2026-04-25T12:00:00.000Z" />)
    expect(html).toContain('Card 2')
    expect(html).toContain('/posts/card-2')
  })
})
