import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'

const emptyDocument = {
  _type: 'inkling' as const,
  schemaVersion: 1 as const,
  lexicalVersion: '0.45.0',
  root: {
    type: 'root' as const,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{ type: 'paragraph' as const, version: 1, children: [] }],
  },
}

describe('snaps/ui/inkling/InklingArticleEditor', () => {
  it('renders the article editor shell', () => {
    const html = stableHtml(
      renderToHtml(
        createElement(InklingArticleEditor, {
          initialDocument: emptyDocument,
          documentKey: 'snap',
          onDocumentChange: vi.fn(),
        }),
      ),
    )
    expect(html).toContain('inkling-article-editor')
    expect(html).toContain('inkling-article-editor__content')
  })
})
