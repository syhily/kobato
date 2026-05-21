import { describe, expect, it } from 'vite-plus/test'

import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'

import { renderInRouter } from './_helpers/render'

// ActionBanner renders the post-save preview link that appears at the top
// of the editor after a successful draft save or publish. The href must
// include the correct base path (/posts for posts, empty for pages).

describe('ActionBanner', () => {
  it('renders /posts/slug?draft=true for a post draft', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="hello"
        basePath="/posts"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="/posts/hello?draft=true"')
  })

  it('renders /posts/slug for a published post', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="published"
        slug="hello"
        basePath="/posts"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="/posts/hello"')
    expect(html).not.toContain('?draft=true')
  })

  it('renders /slug?draft=true for a page draft', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="about"
        basePath=""
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="/about?draft=true"')
  })

  it('renders /slug for a published page', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="published"
        slug="about"
        basePath=""
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="/about"')
    expect(html).not.toContain('?draft=true')
  })

  it('shows draft-specific message and styling', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="hello"
        basePath="/posts"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('草稿已保存')
    expect(html).toContain('bg-status-warn-bg')
  })

  it('shows published-specific message and styling', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="published"
        slug="hello"
        basePath="/posts"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('草稿已发布')
    expect(html).toContain('bg-status-success-bg')
  })
})
