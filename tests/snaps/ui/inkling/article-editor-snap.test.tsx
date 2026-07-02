import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { describe, expect, it, vi } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { INKLING_LEXICAL_VERSION } from '@/shared/inkling/schema'
import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'

// SSR snapshot of the article editor shell. Lexical only reconciles document
// content into the contenteditable after mount (client-side), so this pins
// the server-rendered chrome: wrapper layout, scroll container, prose
// classes, and the contenteditable host the client hydrates into.

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function makeDocument(children: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children },
  }
}

const representativeDocument = makeDocument([
  { type: 'heading', version: 1, tag: 'h2', children: [text('示例标题')] },
  { type: 'paragraph', version: 1, children: [text('这是文章编辑器的一段示例正文。')] },
  { type: 'code-block', version: 1, code: "console.log('hi')", language: 'ts' },
  { type: 'paragraph', version: 1, children: [] },
])

describe('snaps/ui/inkling/InklingArticleEditor', () => {
  it('renders the article editor shell', () => {
    // `LexicalCollaboration` provides the collaboration context that the
    // vendored composable editor reads via `useCollaborationContext`. Lexical
    // 0.46's dev build throws without a provider under the Node (SSR) module
    // pipeline; in the browser pipeline a legacy global fallback applies.
    const html = stableHtml(
      renderToHtml(
        <LexicalCollaboration>
          <InklingArticleEditor
            initialDocument={representativeDocument}
            documentKey="snap"
            onDocumentChange={vi.fn()}
          />
        </LexicalCollaboration>,
      ),
    )

    // Structural invariants the admin editor layout depends on.
    expect(html).toContain('inkling-editor')
    expect(html).toContain('max-w-[740px]')
    expect(html).toContain('inkling-prose')
    // The contenteditable host is present in the SSR output; Lexical only
    // reconciles document content into it after `setRootElement` on the
    // client, so the host is empty here.
    expect(html).toMatch(/contentEditable="(true|false)"/)

    expect(html).toMatchSnapshot()
  })
})
