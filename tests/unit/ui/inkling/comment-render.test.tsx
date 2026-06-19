import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
} from '@/shared/inkling/format'
import { CommentInklingBody } from '@/ui/inkling/render/CommentInklingBody'

function text(value: string, format?: number): InklingInlineNode {
  return { type: 'text', version: 1, text: value, format }
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

// Lexical text format bits, imported from the shared source of truth so the
// test stays in sync with lexical's IS_* constants.
const BOLD = INKLING_FORMAT_BOLD
const ITALIC = INKLING_FORMAT_ITALIC
const CODE = INKLING_FORMAT_CODE
const STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

describe('ui/inkling/CommentInklingBody', () => {
  it('renders a paragraph and blockquote', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            { type: 'paragraph', version: 1, children: [text('Hello world')] },
            { type: 'quote', version: 1, children: [text('Quoted text')] },
          ])}
        />,
      ),
    )
    expect(html).toContain('<p>Hello world</p>')
    expect(html).toContain('<blockquote>Quoted text</blockquote>')
  })

  it('renders decorators', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            {
              type: 'paragraph',
              version: 1,
              children: [
                text('bold ', BOLD),
                text('italic ', ITALIC),
                text('code ', CODE),
                text('strike', STRIKETHROUGH),
              ],
            },
          ])}
        />,
      ),
    )
    expect(html).toMatch(/<strong[^>]*>bold <\/strong>/)
    expect(html).toMatch(/<em[^>]*>italic <\/em>/)
    expect(html).toMatch(/<code[^>]*>code <\/code>/)
    expect(html).toMatch(/<del[^>]*>strike<\/del>/)
  })

  it('renders a safe link', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            {
              type: 'paragraph',
              version: 1,
              children: [
                {
                  type: 'link',
                  version: 1,
                  url: 'https://example.com',
                  target: '_blank',
                  children: [text('visit')],
                },
              ],
            },
          ])}
        />,
      ),
    )
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('visit')
  })

  it('renders inline math', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            {
              type: 'paragraph',
              version: 1,
              children: [text('E = '), { type: 'inline-math', version: 1, tex: 'mc^2' }],
            },
          ])}
        />,
      ),
    )
    expect(html).toContain('<code>$mc^2$</code>')
  })

  it('renders code and math blocks without Shiki/MathML', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            { type: 'code-block', version: 1, code: 'const x = 1', language: 'ts' },
            { type: 'math-block', version: 1, tex: 'a^2' },
          ])}
        />,
      ),
    )
    expect(html).toContain('<pre')
    expect(html).toContain('<code')
    expect(html).toContain('const x = 1')
    expect(html).toContain('$$a^2$$')
  })

  it('renders a nested list', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([
            {
              type: 'list',
              version: 1,
              listType: 'bullet',
              children: [
                {
                  type: 'listitem',
                  version: 1,
                  value: 1,
                  children: [
                    text('outer'),
                    {
                      type: 'list',
                      version: 1,
                      listType: 'number',
                      children: [{ type: 'listitem', version: 1, value: 1, children: [text('inner')] }],
                    },
                  ],
                },
              ],
            },
          ])}
        />,
      ),
    )
    expect(html).toContain('<ul')
    expect(html).toContain('<ol')
    expect(html).toContain('<li>outer')
    expect(html).toContain('inner')
  })

  it('rejects article-only nodes in comment mode', () => {
    expect(() =>
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([{ type: 'heading', version: 1, tag: 'h2', children: [text('x')] }])}
        />,
      ),
    ).toThrow()
  })

  it('applies a custom className', () => {
    const html = stableHtml(
      renderToHtml(
        <CommentInklingBody
          document={makeDocument([{ type: 'paragraph', version: 1, children: [text('x')] }])}
          className="comment-inkling-body"
        />,
      ),
    )
    expect(html).toContain('class="comment-inkling-body"')
  })
})
