import { describe, expect, it } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { commentBodyToMarkdown } from '@/shared/pt/comment-markdown'

const span = (key: string, text: string, marks: string[] = []) => ({ _type: 'span' as const, _key: key, text, marks })
const block = (key: string, children: ReturnType<typeof span>[], extra: Record<string, unknown> = {}) => ({
  _type: 'block' as const,
  _key: key,
  style: 'normal' as const,
  children,
  ...extra,
})

describe('shared/pt/comment-markdown — commentBodyToMarkdown', () => {
  it('renders plain text blocks separated by blank lines', () => {
    const body = [block('b1', [span('s1', 'hello')]), block('b2', [span('s2', 'world')])] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('hello\n\nworld')
  })

  it('renders strong/em/strike/underline marks inline', () => {
    const body = [
      block('b', [
        span('a', 'bold', ['strong']),
        span('b', 'italic', ['em']),
        span('c', 'strike', ['strike-through']),
        span('d', 'under', ['underline']),
      ]),
    ] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('**bold***italic*~~strike~~<u>under</u>')
  })

  it('renders inline code with backticks, ignoring other decorators', () => {
    const body = [block('b', [span('s', 'x', ['code', 'strong'])])] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('`x`')
  })

  it('renders links wrapping the text', () => {
    const body = [
      block('b', [span('s', 'click', ['link1'])], {
        markDefs: [{ _type: 'link', _key: 'link1', href: 'https://example.com' }],
      }),
    ] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('[click](https://example.com)')
  })

  it('angle-brackets link URLs containing parens', () => {
    const body = [
      block('b', [span('s', 'see', ['link1'])], {
        markDefs: [{ _type: 'link', _key: 'link1', href: 'https://example.com/(v)' }],
      }),
    ] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('[see](<https://example.com/(v)>)')
  })

  it('renders inline math using $tex$ syntax', () => {
    const body = [
      block('b', [span('s', '', ['m1'])], { markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'a+b' }] }),
    ] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('$a+b$')
  })

  it('renders list items with bullets and indentation', () => {
    const body = [
      block('b1', [span('s', 'first')], { listItem: 'bullet' }),
      block('b2', [span('s', 'nested')], { listItem: 'bullet', level: 2 }),
    ] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('- first\n  - nested')
  })

  it('renders numbered list items', () => {
    const body = [block('b', [span('s', 'one')], { listItem: 'number' })] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('1. one')
  })

  it('prefixes each line of a blockquote with >', () => {
    const body = [block('b', [span('s1', 'line1\nline2')], { style: 'blockquote' })] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('> line1\n> line2')
  })

  it('renders fenced code blocks with language', () => {
    const body = [{ _type: 'code', _key: 'c', code: 'print(1)', language: 'python' }] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('```python\nprint(1)\n```')
  })

  it('renders fenced code blocks without language when missing', () => {
    const body = [{ _type: 'code', _key: 'c', code: 'x' }] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('```\nx\n```')
  })

  it('renders math blocks as $$tex$$', () => {
    const body = [{ _type: 'mathBlock', _key: 'm', tex: 'a^2' }] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('$$a^2$$')
  })

  it('escapes markdown-significant characters in span text', () => {
    const body = [block('b', [span('s', 'a*b_c')])] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('a\\*b\\_c')
  })

  it('trims trailing whitespace from the final output', () => {
    const body = [block('b', [span('s', 'hi')])] as CommentBody
    expect(commentBodyToMarkdown(body)).toBe('hi')
  })
})
