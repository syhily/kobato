import { createHeadlessEditor } from '@inkling/editor'
// @vitest-environment jsdom
// jsdom: the decorator cards (codeblock/math) serialize through @lexical/html,
// which needs a DOM document even for a headless parse → toJSON round-trip.
import { describe, expect, it } from 'vitest'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { commentEditorStateSchema, type CommentEditorState } from '@/shared/lexical/comment-schema'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// A comment using every capability the surface advertises (node whitelist:
// paragraph, quote, nested list, link, code block, math block, math-inline).
// Parsed back through the real composer node set below — the round-trip must
// not drop or rewrite a single node, or pre-existing comments would lose
// content the moment they are opened in the new editor.
const RICH_COMMENT = unsafeCast<CommentEditorState>({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          { type: 'extended-text', version: 1, detail: 0, format: 1, mode: 'normal', style: '', text: 'bold ' },
          {
            type: 'link',
            version: 1,
            url: 'https://example.com/docs',
            rel: null,
            target: null,
            title: null,
            direction: null,
            format: '',
            indent: 0,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'docs' },
            ],
          },
          { type: 'math-inline', version: 1, tex: 'E=mc^2', mathml: '', svg: '' },
        ],
      },
      {
        type: 'extended-quote',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'paragraph',
            version: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'quoted' },
            ],
          },
        ],
      },
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'one' },
            ],
          },
          {
            type: 'listitem',
            version: 1,
            value: 2,
            direction: null,
            format: '',
            indent: 0,
            children: [
              {
                type: 'list',
                version: 1,
                listType: 'number',
                start: 1,
                tag: 'ol',
                direction: null,
                format: '',
                indent: 0,
                children: [
                  {
                    type: 'listitem',
                    version: 1,
                    value: 1,
                    direction: null,
                    format: '',
                    indent: 0,
                    children: [
                      {
                        type: 'extended-text',
                        version: 1,
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'nested',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { type: 'codeblock', version: 1, code: "console.log('hi')", language: 'ts', caption: '', highlightedHtml: '' },
      { type: 'math', version: 1, tex: '\\int_0^1 x\\,dx', mathml: '', svg: '' },
    ],
  },
})

function collectTypes(state: CommentEditorState): string[] {
  const types: string[] = []
  visitLexicalNodes(state, (node) => {
    types.push(node.type)
  })
  return types.sort()
}

describe('COMMENT_EDITOR_NODES round-trip', () => {
  it('the perimeter schema accepts the full comment capability set', () => {
    const result = commentEditorStateSchema.safeParse(RICH_COMMENT)
    expect(result.success).toBe(true)
  })

  it('parses a stored comment through the composer node set without dropping a node', () => {
    const editor = createHeadlessEditor({
      nodes: COMMENT_EDITOR_NODES,
      onError: (error: Error) => {
        throw error
      },
    })
    const parsed = editor.parseEditorState(RICH_COMMENT)
    const roundTripped = unsafeCast<CommentEditorState>(parsed.toJSON())

    expect(collectTypes(roundTripped)).toEqual(collectTypes(RICH_COMMENT))

    const payloads = { code: [] as string[], tex: [] as string[] }
    visitLexicalNodes(roundTripped, (node) => {
      const dataset = unsafeCast<{ code?: unknown; tex?: unknown }>(node)
      if (typeof dataset.code === 'string' && dataset.code.length > 0) {
        payloads.code.push(dataset.code)
      }
      if (typeof dataset.tex === 'string' && dataset.tex.length > 0) {
        payloads.tex.push(dataset.tex)
      }
    })
    expect(payloads.code).toEqual(["console.log('hi')"])
    expect(payloads.tex.sort()).toEqual(['E=mc^2', '\\int_0^1 x\\,dx'])
  })

  it('rejects article-only nodes at the composer (headings are not comment nodes)', () => {
    const editor = createHeadlessEditor({
      nodes: COMMENT_EDITOR_NODES,
      onError: (error: Error) => {
        throw error
      },
    })
    const withHeading = unsafeCast<CommentEditorState>({
      root: {
        type: 'root',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'extended-heading',
            version: 1,
            tag: 'h2',
            direction: 'ltr',
            format: '',
            indent: 0,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'Title' },
            ],
          },
        ],
      },
    })
    expect(() => editor.parseEditorState(withHeading)).toThrow()
  })
})
