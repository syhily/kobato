// @vitest-environment happy-dom

// Regression test for the card-decorator-render bug.
//
// Background: Lexical's React bindings only mount the decorator renderer
// (the code that portals each DecoratorNode's `decorate()` output into its
// host element) from inside `<RichTextPlugin>`. For a period the Inkling
// editors rendered `<ContentEditable>` directly without `<RichTextPlugin>`,
// so card nodes (image/music/code/math/table/hr) existed in editor state but
// their host elements rendered EMPTY — the React content was never injected.
//
// This test mounts the full `<InklingArticleEditor>` with a document
// containing an image-card and asserts the `<img>` actually appears in the
// DOM (i.e. the decorator portal ran). It would have caught the regression.

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'

function makeDocument(children: InklingDocument['root']['children']): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children },
  }
}

describe('InklingArticleEditor — decorator cards render into DOM', () => {
  it('renders an image-card <img> via the decorate() portal', () => {
    const document = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', version: 1, text: 'intro', mode: 'normal', style: '', detail: 0, format: 0 }],
      },
      {
        type: 'image-card',
        version: 1,
        src: 'https://example.com/photo.png',
        alt: 'a photo',
        caption: '',
        layout: 'center',
      },
    ])

    const { container } = render(
      <InklingArticleEditor initialDocument={document} documentKey="decorator-regression" onDocumentChange={vi.fn()} />,
    )

    // The image-card host is a <figure data-inkling-image-card>. Before the
    // RichTextPlugin fix it rendered empty; the <img> only appears once the
    // decorator portal injects ImageCardComponent's output.
    const img = container.querySelector('figure[data-inkling-image-card] img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.png')
  })
})
