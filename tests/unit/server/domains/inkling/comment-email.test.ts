import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { commentInklingToEmailHtml } from '@/server/domains/inkling/comment-email'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'

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
const UNDERLINE = INKLING_FORMAT_UNDERLINE
const CODE = INKLING_FORMAT_CODE
const STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

describe('server/domains/inkling/comment-email', () => {
  it('renders a paragraph', () => {
    const html = commentInklingToEmailHtml(makeDocument([{ type: 'paragraph', version: 1, children: [text('hello')] }]))
    expect(html).toBe('<p>hello</p>')
  })

  it('renders a blockquote', () => {
    const html = commentInklingToEmailHtml(makeDocument([{ type: 'quote', version: 1, children: [text('quoted')] }]))
    expect(html).toBe('<blockquote>quoted</blockquote>')
  })

  it('renders all standard decorators', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        {
          type: 'paragraph',
          version: 1,
          children: [
            text('bold ', BOLD),
            text('italic ', ITALIC),
            text('underline ', UNDERLINE),
            text('code ', CODE),
            text('strike', STRIKETHROUGH),
          ],
        },
      ]),
    )
    expect(html).toContain('<strong>bold </strong>')
    expect(html).toContain('<em>italic </em>')
    expect(html).toContain('<u>underline </u>')
    expect(html).toContain('<code>code </code>')
    expect(html).toContain('<s>strike</s>')
  })

  it('prefers code decorator over other decorators', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([{ type: 'paragraph', version: 1, children: [text('mixed', BOLD | CODE)] }]),
    )
    expect(html).toBe('<p><code>mixed</code></p>')
  })

  it('renders a safe link with rel and target', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        {
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'link',
              version: 1,
              url: 'https://example.com',
              rel: 'noopener',
              target: '_blank',
              children: [text('visit')],
            },
          ],
        },
      ]),
    )
    expect(html).toBe('<p><a href="https://example.com" rel="noopener" target="_blank">visit</a></p>')
  })

  it('escapes link href and text', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        {
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'link',
              version: 1,
              url: 'https://example.com?x=1&y=2',
              children: [text('<script>')],
            },
          ],
        },
      ]),
    )
    expect(html).toContain('href="https://example.com?x=1&amp;y=2"')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders inline math as TeX inside code', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        { type: 'paragraph', version: 1, children: [text('E = '), { type: 'inline-math', version: 1, tex: 'mc^2' }] },
      ]),
    )
    expect(html).toBe('<p>E = <code>$mc^2$</code></p>')
  })

  it('escapes inline math TeX', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([{ type: 'paragraph', version: 1, children: [{ type: 'inline-math', version: 1, tex: '<x>' }] }]),
    )
    expect(html).toBe('<p><code>$&lt;x&gt;$</code></p>')
  })

  it('renders a code block without highlighting', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([{ type: 'code-block', version: 1, code: 'const x = 1', language: 'ts' }]),
    )
    expect(html).toBe('<pre><code data-language="ts">const x = 1</code></pre>')
  })

  it('renders a math block as TeX fallback', () => {
    const html = commentInklingToEmailHtml(makeDocument([{ type: 'math-block', version: 1, tex: 'a^2 + b^2' }]))
    expect(html).toBe('<pre><code>$$a^2 + b^2$$</code></pre>')
  })

  it('renders a bullet list', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        {
          type: 'list',
          version: 1,
          listType: 'bullet',
          children: [
            { type: 'listitem', version: 1, value: 1, children: [text('one')] },
            { type: 'listitem', version: 1, value: 2, children: [text('two')] },
          ],
        },
      ]),
    )
    expect(html).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('renders an ordered list', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
        {
          type: 'list',
          version: 1,
          listType: 'number',
          children: [{ type: 'listitem', version: 1, value: 1, children: [text('first')] }],
        },
      ]),
    )
    expect(html).toBe('<ol><li>first</li></ol>')
  })

  it('renders nested lists', () => {
    const html = commentInklingToEmailHtml(
      makeDocument([
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
      ]),
    )
    expect(html).toBe('<ul><li>outer<ol><li>inner</li></ol></li></ul>')
  })

  it('rejects article-only block nodes', () => {
    expect(() =>
      commentInklingToEmailHtml(makeDocument([{ type: 'heading', version: 1, tag: 'h2', children: [text('x')] }])),
    ).toThrow('comment-email cannot render article-only node: heading')
  })

  it('rejects footnote-ref inline nodes', () => {
    expect(() =>
      commentInklingToEmailHtml(
        makeDocument([
          {
            type: 'paragraph',
            version: 1,
            children: [
              { type: 'footnote-ref', version: 1, targetKey: 'fn1', refKey: 'fnr1', index: 1 } as InklingInlineNode,
            ],
          },
        ]),
      ),
    ).toThrow('comment-email cannot render article-only node: footnote-ref')
  })
})
