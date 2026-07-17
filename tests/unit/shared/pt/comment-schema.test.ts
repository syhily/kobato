import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { commentBodyToMarkdown } from '@/shared/pt/comment-markdown'
import {
  commentTextBlockSchema,
  isCommentBodyEmpty,
  safeValidateCommentBody,
  validateCommentBody,
} from '@/shared/pt/comment-schema'
import { textBlockSchema } from '@/shared/pt/schema'

// `commentBodyToMarkdown` is the rollback / plain-text snapshot
// stored in `comment.content` after every save. The test fixtures
// pin every dialect feature so future schema additions force a
// conscious decision about how they project to markdown.

function span(text: string, marks?: string[]) {
  return { _type: 'span' as const, _key: `s-${text.slice(0, 6)}`, text, marks }
}

describe('commentBodyToMarkdown', () => {
  it('renders a plain paragraph', () => {
    const body: CommentBody = [{ _type: 'block', _key: 'b1', style: 'normal', children: [span('Hello world')] }]
    expect(commentBodyToMarkdown(body)).toBe('Hello world')
  })

  it('emits inline marks (strong, em, code, strike)', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          span('bold', ['strong']),
          span(' '),
          span('italic', ['em']),
          span(' '),
          span('crossed', ['strike-through']),
          span(' '),
          span('mono', ['code']),
        ],
      },
    ]
    expect(commentBodyToMarkdown(body)).toBe('**bold** *italic* ~~crossed~~ `mono`')
  })

  it('emits links via markDef references', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [span('see '), span('docs', ['link-1'])],
        markDefs: [{ _type: 'link', _key: 'link-1', href: 'https://example.com' }],
      },
    ]
    expect(commentBodyToMarkdown(body)).toBe('see [docs](https://example.com)')
  })

  it('emits inline math from mathInline markDefs', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [span('Einstein said '), span('', ['m-1'])],
        markDefs: [{ _type: 'mathInline', _key: 'm-1', tex: 'E=mc^2' }],
      },
    ]
    expect(commentBodyToMarkdown(body)).toBe('Einstein said $E=mc^2$')
  })

  it('renders blockquotes line-prefixed', () => {
    const body: CommentBody = [{ _type: 'block', _key: 'b1', style: 'blockquote', children: [span('quoted text')] }]
    expect(commentBodyToMarkdown(body)).toBe('> quoted text')
  })

  it('renders bullet and numbered list items at nested levels', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', listItem: 'bullet', level: 1, children: [span('one')] },
      { _type: 'block', _key: 'b2', listItem: 'number', level: 2, children: [span('nested')] },
      { _type: 'block', _key: 'b3', listItem: 'bullet', level: 1, children: [span('two')] },
    ]
    expect(commentBodyToMarkdown(body)).toBe('- one\n  1. nested\n- two')
  })

  it('renders fenced code blocks with language tag', () => {
    const body: CommentBody = [{ _type: 'code', _key: 'c1', code: "console.log('hi')", language: 'ts' }]
    expect(commentBodyToMarkdown(body)).toBe("```ts\nconsole.log('hi')\n```")
  })

  it('renders block math', () => {
    const body: CommentBody = [{ _type: 'mathBlock', _key: 'm1', tex: '\\int_0^1 x\\,dx' }]
    expect(commentBodyToMarkdown(body)).toBe('$$\\int_0^1 x\\,dx$$')
  })

  it('separates non-list blocks with blank lines', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [span('para 1')] },
      { _type: 'block', _key: 'b2', style: 'normal', children: [span('para 2')] },
      { _type: 'code', _key: 'c1', code: 'x', language: 'js' },
    ]
    expect(commentBodyToMarkdown(body)).toBe('para 1\n\npara 2\n\n```js\nx\n```')
  })

  it('escapes markdown metacharacters in plain text spans', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [span('use *asterisk* and _underscore_')],
      },
    ]
    expect(commentBodyToMarkdown(body)).toBe('use \\*asterisk\\* and \\_underscore\\_')
  })
})

const validBody: CommentBody = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hello' }] },
]

describe('validateCommentBody', () => {
  it('inherits the canonical text-block field set', () => {
    expect(Object.keys(commentTextBlockSchema.shape).sort()).toEqual(Object.keys(textBlockSchema.shape).sort())
  })

  it('returns a valid comment body', () => {
    expect(validateCommentBody(validBody)).toEqual(validBody)
  })

  it('throws for a body with a disallowed block style', () => {
    const bad = [{ _type: 'block', _key: 'b1', style: 'h2', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] }]
    expect(() => validateCommentBody(bad)).toThrow()
  })
})

describe('safeValidateCommentBody', () => {
  it('returns ok:true for a valid body', () => {
    const result = safeValidateCommentBody(validBody)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body).toEqual(validBody)
  })

  it('returns ok:false with a ZodError for an invalid body', () => {
    const result = safeValidateCommentBody([{ _type: 'image', _key: 'i1', src: '/x.png' }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(z.ZodError)
  })
})

describe('isCommentBodyEmpty', () => {
  it('returns true for an empty array', () => {
    expect(isCommentBodyEmpty([])).toBe(true)
  })

  it('returns true for whitespace-only spans', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: '   ' }] },
    ]
    expect(isCommentBodyEmpty(body)).toBe(true)
  })

  it('returns false for non-empty text', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] },
    ]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })

  it('returns false for non-empty code', () => {
    const body: CommentBody = [{ _type: 'code', _key: 'c1', code: 'const x = 1' }]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })

  it('returns false for non-empty math', () => {
    const body: CommentBody = [{ _type: 'mathBlock', _key: 'm1', tex: 'E=mc^2' }]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })
})
