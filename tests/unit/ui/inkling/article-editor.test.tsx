import type { SerializedEditorState, SerializedRootNode } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ParagraphNode } from 'lexical'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { validateInklingDocument } from '@/shared/inkling/schema'
import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/card-nodes'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function makeDocument(rootChildren: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: rootChildren,
    },
  }
}

function buildHeadlessArticleEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-article-editor-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless article editor test error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      FootnoteRefNode,
      InlineMathNode,
      ImageCardNode,
      CodeCardNode,
      MathCardNode,
      MusicCardNode,
      HorizontalRuleCardNode,
      TableCardNode,
    ],
  })
}

function documentToEditorState(document: InklingDocument): SerializedEditorState {
  const root = {
    ...document.root,
    direction: null,
    format: '',
    indent: 0,
  } as SerializedRootNode
  return { root }
}

describe('ui/inkling/editor/article/InklingArticleEditor', () => {
  it('renders without throwing', () => {
    const onChange = vi.fn()
    const document = makeDocument([{ type: 'paragraph', version: 1, children: [text('Hello')] }])

    expect(() => {
      renderToStaticMarkup(
        createElement(InklingArticleEditor, {
          initialDocument: document,
          documentKey: 'test',
          onDocumentChange: onChange,
        }),
      )
    }).not.toThrow()
  })

  it('initializes from a converted synthetic article and serializes back to valid Inkling JSON', () => {
    const document = makeDocument([
      { type: 'paragraph', version: 1, children: [text('Hello article')] },
      {
        type: 'image-card',
        version: 1,
        src: 'https://example.com/image.png',
        alt: 'example',
        caption: 'An example image',
        layout: 'center',
      },
      { type: 'code-block', version: 1, code: 'const x = 1', language: 'ts' },
      { type: 'math-block', version: 1, tex: 'E = mc^2' },
      { type: 'music-card', version: 1, playerId: 'music-123' },
      { type: 'horizontal-rule', version: 1 },
      {
        type: 'table',
        version: 1,
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [{ type: 'tablecell', version: 1, children: [text('A')] }],
          },
        ],
      },
    ])

    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(editor.parseEditorState(documentToEditorState(document)))

    const serialized = editor.getEditorState().toJSON()
    const roundTripped = validateInklingDocument({
      _type: 'inkling',
      schemaVersion: 1,
      lexicalVersion: '0.45.0',
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      root: serialized.root as InklingDocument['root'],
    })

    expect(roundTripped.root.children).toHaveLength(7)
    expect(roundTripped.root.children[0]?.type).toBe('paragraph')
    expect(roundTripped.root.children[1]?.type).toBe('image-card')
    expect(roundTripped.root.children[2]?.type).toBe('code-block')
    expect(roundTripped.root.children[3]?.type).toBe('math-block')
    expect(roundTripped.root.children[4]?.type).toBe('music-card')
    expect(roundTripped.root.children[5]?.type).toBe('horizontal-rule')
    expect(roundTripped.root.children[6]?.type).toBe('table')

    const imageCard = roundTripped.root.children[1]
    expect(imageCard?.type).toBe('image-card')
    if (imageCard?.type === 'image-card') {
      expect(imageCard.src).toBe('https://example.com/image.png')
      expect(imageCard.alt).toBe('example')
      expect(imageCard.caption).toBe('An example image')
      expect(imageCard.layout).toBe('center')
    }
  })

  it('preserves inline math and footnote ref nodes', () => {
    const document = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        children: [
          text('Hello '),
          { type: 'inline-math', version: 1, tex: 'x^2' },
          { type: 'footnote-ref', version: 1, targetKey: 'def-1', refKey: 'ref-1', index: 1 },
        ],
      },
    ])

    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(editor.parseEditorState(documentToEditorState(document)))

    const serialized = editor.getEditorState().toJSON()
    const paragraph = serialized.root.children[0] as { type?: string; children?: Array<{ type?: string }> } | undefined
    expect(paragraph?.type).toBe('paragraph')
    expect(paragraph?.children?.[1]?.type).toBe('inline-math')
    expect(paragraph?.children?.[2]?.type).toBe('footnote-ref')
  })
})
