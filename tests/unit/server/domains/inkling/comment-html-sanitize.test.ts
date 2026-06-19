import { describe, expect, it } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { sanitizeCommentSpanText, type SanitizeToken } from '@/shared/inkling/comment-html-sanitize'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { commentPortableTextToInklingDocument } from '@/shared/inkling/migrate-pt'

function span(text: string, key: string, marks?: string[]) {
  return { _type: 'span' as const, _key: key, text, marks }
}

function bodyWithSpan(text: string, marks?: string[]): CommentBody {
  return [{ _type: 'block', _key: 'b1', style: 'normal', children: [span(text, 's1', marks)] }]
}

function bodyWithSpans(spans: ReturnType<typeof span>[]): CommentBody {
  return [{ _type: 'block', _key: 'b1', style: 'normal', children: spans }]
}

function textToken(text: string, decorators: string[] = []): SanitizeToken {
  return {
    kind: 'text',
    text,
    decorators: decorators as ('strong' | 'em' | 'underline' | 'code' | 'strike-through')[],
  }
}

function firstTextChild(doc: ReturnType<typeof commentPortableTextToInklingDocument>) {
  const first = doc.root.children[0]
  expect(first?.type).toBe('paragraph')
  const child = (first as { children: unknown[] }).children[0]
  expect(child && typeof child === 'object' && (child as { type?: string }).type).toBe('text')
  return child as { text: string; format?: number }
}

describe('server/domains/inkling/comment-html-sanitize', () => {
  it('returns an empty array for empty input', () => {
    expect(sanitizeCommentSpanText('', [])).toEqual([])
  })

  it('returns a single text token for plain text', () => {
    expect(sanitizeCommentSpanText('hello', [])).toEqual([textToken('hello')])
  })

  it('preserves parent decorators on plain text', () => {
    expect(sanitizeCommentSpanText('hello', ['strong'])).toEqual([textToken('hello', ['strong'])])
  })

  it('R1: <p>hello</p> emits paragraph split around text', () => {
    const tokens = sanitizeCommentSpanText('<p>hello</p>', [])
    expect(tokens).toEqual([{ kind: 'paragraph-split' }, textToken('hello'), { kind: 'paragraph-split' }])
  })

  it('R1: a<p>b</p>c emits text-split-text-split-text', () => {
    const tokens = sanitizeCommentSpanText('a<p>b</p>c', [])
    expect(tokens).toEqual([
      textToken('a'),
      { kind: 'paragraph-split' },
      textToken('b'),
      { kind: 'paragraph-split' },
      textToken('c'),
    ])
  })

  it('R2: <br> emits a linebreak', () => {
    const tokens = sanitizeCommentSpanText('line1<br>line2', [])
    expect(tokens).toEqual([textToken('line1'), { kind: 'linebreak' }, textToken('line2')])
  })

  it('R2: <br/> self-closing emits a linebreak', () => {
    const tokens = sanitizeCommentSpanText('line1<br/>line2', [])
    expect(tokens).toEqual([textToken('line1'), { kind: 'linebreak' }, textToken('line2')])
  })

  it('R3: <a href> becomes a link token', () => {
    const tokens = sanitizeCommentSpanText('<a href="https://example.com" rel="nofollow" title="ex">link</a>', [])
    expect(tokens).toEqual([
      {
        kind: 'link',
        text: 'link',
        decorators: [],
        url: 'https://example.com',
        rel: 'nofollow',
        title: 'ex',
      },
    ])
  })

  it('R3: nested formatting inside <a> keeps all text', () => {
    const tokens = sanitizeCommentSpanText('<a href="https://example.com">visit <b>bold</b> site</a>', [])
    expect(tokens).toEqual([
      {
        kind: 'link',
        text: 'visit bold site',
        decorators: [],
        url: 'https://example.com',
      },
    ])
  })

  it('R3: javascript href is stripped and text kept', () => {
    const tokens = sanitizeCommentSpanText('<a href="javascript:alert(1)">x</a>', [])
    expect(tokens).toEqual([textToken('x')])
  })

  it('R3: empty href is stripped and text kept', () => {
    const tokens = sanitizeCommentSpanText('<a href="">x</a>', [])
    expect(tokens).toEqual([textToken('x')])
  })

  it('R4: orphan <a> opening tag is stripped', () => {
    const tokens = sanitizeCommentSpanText('<a href="https://example.com">orphan', [])
    expect(tokens).toEqual([textToken('orphan')])
  })

  it('R5: <img alt> degrades to alt text', () => {
    const tokens = sanitizeCommentSpanText('<img src="https://x/y.png" alt="a diagram">', [])
    expect(tokens).toEqual([textToken('a diagram')])
  })

  it('R5: <img> without alt degrades to placeholder text', () => {
    const tokens = sanitizeCommentSpanText('<img src="https://x/y.png">', [])
    expect(tokens).toEqual([textToken('[图片]')])
  })

  it('R6: <b>bold</b> adds strong decorator', () => {
    const tokens = sanitizeCommentSpanText('<b>bold</b>', [])
    expect(tokens).toEqual([textToken('bold', ['strong'])])
  })

  it('R6: orphan <b> is stripped with no decorator', () => {
    const tokens = sanitizeCommentSpanText('<b>notbold', [])
    expect(tokens).toEqual([textToken('notbold')])
  })

  it('R7: <div>junk</div> strips tags and keeps text', () => {
    const tokens = sanitizeCommentSpanText('<div>junk</div>', [])
    expect(tokens).toEqual([textToken('junk')])
  })

  it('R7: orphan </blockquote> is stripped', () => {
    const tokens = sanitizeCommentSpanText('</blockquote>', [])
    expect(tokens).toEqual([])
  })

  it('R8: HTML entities are decoded', () => {
    const tokens = sanitizeCommentSpanText('a &amp; b &lt; c', [])
    expect(tokens).toEqual([textToken('a & b < c')])
  })

  it('combined: paragraph, link, linebreak inside <p>', () => {
    const tokens = sanitizeCommentSpanText('<p>visit <a href="https://e.com" rel="nofollow">site</a><br>end</p>', [])
    expect(tokens).toEqual([
      { kind: 'paragraph-split' },
      textToken('visit '),
      { kind: 'link', text: 'site', decorators: [], url: 'https://e.com', rel: 'nofollow' },
      { kind: 'linebreak' },
      textToken('end'),
      { kind: 'paragraph-split' },
    ])
  })

  it('decorator preservation: parent strong + inner <i> merges decorators', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('<i>italic</i>', ['strong']))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    const child = firstTextChild(doc)
    // strong (1) + em (2) => 3
    expect(child.format).toBe(3)
    expect(child.text).toBe('italic')
  })

  it('paragraph split produces multiple comment paragraph blocks', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('<p>a</p><p>b</p>'))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    expect(doc.root.children).toHaveLength(2)
    expect(doc.root.children[0]?.type).toBe('paragraph')
    expect(doc.root.children[1]?.type).toBe('paragraph')
  })

  it('link from literal <a> validates as a comment link node', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('<a href="https://example.com">link</a>'))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    const paragraph = doc.root.children[0]
    expect(paragraph?.type).toBe('paragraph')
    const children = (paragraph as { children: unknown[] }).children
    expect(children).toHaveLength(1)
    const link = children[0] as { type: string; url: string; children: unknown[] }
    expect(link.type).toBe('link')
    expect(link.url).toBe('https://example.com')
  })

  it('image with alt degrades to plain text in comment output', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('<img src="https://x/y.png" alt="a diagram">'))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    const child = firstTextChild(doc)
    expect(child.text).toBe('a diagram')
  })

  it('image without alt degrades to placeholder text without losing the paragraph', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('<img src="https://x/y.png">'))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    const child = firstTextChild(doc)
    expect(child.text).toBe('[图片]')
  })

  it('orphan closing tags do not emit residual tag text', () => {
    const doc = commentPortableTextToInklingDocument(bodyWithSpan('</blockquote>'))
    expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
    const paragraph = doc.root.children[0]
    expect(paragraph?.type).toBe('paragraph')
    expect((paragraph as { children: unknown[] }).children).toHaveLength(0)
  })

  it('sanitized output has no residual tag-shaped text in text nodes', () => {
    const fixtures = [
      '<p>hello</p>',
      '<a href="https://example.com">x</a>',
      '<img src="x" alt="y">',
      '<br>',
      '<div>text</div>',
    ]
    for (const fixture of fixtures) {
      const doc = commentPortableTextToInklingDocument(bodyWithSpan(fixture))
      expect(validateInklingDocumentForMode(doc, 'comment')).toEqual({ ok: true })
      let text = ''
      const collect = (node: unknown) => {
        if (node && typeof node === 'object') {
          const n = node as { type?: string; text?: string; children?: unknown[] }
          if (n.type === 'text' && typeof n.text === 'string') {
            text += n.text
          }
          if (Array.isArray(n.children)) {
            for (const child of n.children) collect(child)
          }
        }
      }
      for (const child of doc.root.children) collect(child)
      expect(text).not.toMatch(/<\/?[a-zA-Z]/)
    }
  })
})
