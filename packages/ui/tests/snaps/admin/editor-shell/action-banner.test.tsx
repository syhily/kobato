import { renderInRouter } from '#/_helpers/render'

import { ActionBanner } from '@kobato/ui/admin/editor-shell/ActionBanner'
import { describe, expect, it } from 'vitest'

// ActionBanner renders the post-save preview link that appears at the top
// of the editor after a successful draft save or publish. The href must
// include the correct link prefix (/posts for posts, empty for pages) —
// and, in the headless split, the frontend origin + preview token (plan
// 0.5 §5: `linkPrefix` = origin + path, `previewQuery` = the bare
// `preview_token=…` pair).

describe('ActionBanner', () => {
  it('renders /posts/slug?draft=true for a post draft', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="hello"
        linkPrefix="/posts"
        previewQuery=""
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
        linkPrefix="/posts"
        previewQuery=""
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
        linkPrefix=""
        previewQuery=""
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
        linkPrefix=""
        previewQuery=""
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="/about"')
    expect(html).not.toContain('?draft=true')
  })

  it('appends the preview token after ?draft=true on draft links', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="hello"
        linkPrefix="https://front.example.com/posts"
        previewQuery="preview_token=abc.def"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="https://front.example.com/posts/hello?draft=true&amp;preview_token=abc.def"')
  })

  it('appends the preview token as the only query on published links', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="published"
        slug="hello"
        linkPrefix="https://front.example.com/posts"
        previewQuery="preview_token=abc.def"
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('href="https://front.example.com/posts/hello?preview_token=abc.def"')
  })

  it('shows draft-specific message and styling', () => {
    const html = renderInRouter(
      <ActionBanner
        kind="draft"
        slug="hello"
        linkPrefix="/posts"
        previewQuery=""
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
        linkPrefix="/posts"
        previewQuery=""
        onClose={() => {
          /* noop */
        }}
      />,
    )
    expect(html).toContain('草稿已发布')
    expect(html).toContain('bg-status-success-bg')
  })
})
