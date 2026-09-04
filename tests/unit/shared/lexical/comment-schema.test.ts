import { describe, expect, it } from 'vitest'

import {
  COMMENT_LIST_MAX_DEPTH,
  commentEditorStateSchema,
  safeValidateCommentEditorState,
} from '@/shared/lexical/comment-schema'

// Comment fixtures mirror the PT comment capability set: multi-paragraph,
// blockquote, nested lists, code block, math block, link, math-inline.

function element(type: string, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { type, version: 1, children, direction: 'ltr', format: '', indent: 0, ...extra }
}

function text(value: string, extra: Record<string, unknown> = {}) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: value, ...extra }
}

function state(children: unknown[]) {
  return { root: element('root', children) }
}

function nestedList(depth: number): unknown {
  const item = element('listitem', depth === 1 ? [text('item')] : [nestedList(depth - 1)], { value: 1 })
  return element('list', [item], { listType: 'number', start: 1, tag: 'ol' })
}

describe('commentEditorStateSchema', () => {
  it('accepts a valid comment covering the full comment capability set', () => {
    const value = state([
      element('paragraph', [text('First paragraph')]),
      element('paragraph', [
        text('Second with '),
        element('link', [text('link')], { url: 'https://example.com' }),
        element('autolink', [text('https://example.com')], { url: 'https://example.com' }),
        { type: 'math-inline', version: 1, tex: 'a+b', mathml: '', svg: '<svg/>' },
        { type: 'linebreak', version: 1 },
      ]),
      element('extended-quote', [text('quoted')]),
      nestedList(2),
      { type: 'codeblock', version: 1, code: 'x()', language: 'js', caption: '', highlightedHtml: '' },
      { type: 'math', version: 1, tex: '\\int x', mathml: '<math/>', svg: '' },
    ])
    expect(commentEditorStateSchema.safeParse(value).success).toBe(true)
  })

  it('enforces the list nesting cap', () => {
    expect(commentEditorStateSchema.safeParse(state([nestedList(COMMENT_LIST_MAX_DEPTH)])).success).toBe(true)
    expect(commentEditorStateSchema.safeParse(state([nestedList(COMMENT_LIST_MAX_DEPTH + 1)])).success).toBe(false)
    // the cap counts list ancestry, not tree depth: a list inside a quote
    // still starts at depth 1
    expect(commentEditorStateSchema.safeParse(state([element('extended-quote', [nestedList(1)])])).success).toBe(true)
    expect(
      commentEditorStateSchema.safeParse(state([element('extended-quote', [nestedList(COMMENT_LIST_MAX_DEPTH + 1)])]))
        .success,
    ).toBe(false)
  })

  it('rejects article-only node types', () => {
    const articleOnly: unknown[] = [
      element('extended-heading', [text('h')], { tag: 'h3' }),
      {
        type: 'image',
        version: 1,
        src: '/storage/a.png',
        caption: '',
        title: '',
        alt: '',
        cardWidth: 'regular',
        width: null,
        height: null,
        href: '',
      },
      element('table', []),
      { ...text('1'), type: 'footnote-ref', targetKey: 'fn-1' },
      { type: 'footnotedefinition', version: 1, content: '', targetKey: 'fn-1', index: 1 },
      { type: 'horizontalrule', version: 1 },
      { type: 'solution', version: 1 },
      { type: 'two-column', version: 1 },
      { type: 'music-player', version: 1, playerId: 'p1' },
    ]
    for (const node of articleOnly) {
      expect(commentEditorStateSchema.safeParse(state([node])).success, (node as { type: string }).type).toBe(false)
    }
  })

  it('still validates shape inside the allowed subset', () => {
    expect(commentEditorStateSchema.safeParse(state([{ type: 'paragraph' }])).success).toBe(false)
    expect(
      commentEditorStateSchema.safeParse(
        state([element('paragraph', [element('link', [text('x')], { url: 'javascript:x' })])]),
      ).success,
    ).toBe(false)
    expect(
      commentEditorStateSchema.safeParse(state([{ type: 'math', version: 1, tex: 1, mathml: '', svg: '' }])).success,
    ).toBe(false)
  })

  it('rejects malformed states', () => {
    expect(commentEditorStateSchema.safeParse(undefined).success).toBe(false)
    expect(commentEditorStateSchema.safeParse(42).success).toBe(false)
    expect(commentEditorStateSchema.safeParse({ root: element('paragraph') }).success).toBe(false)
  })
})

describe('safeValidateCommentEditorState', () => {
  it('returns the parsed state on success', () => {
    const value = state([element('paragraph', [text('hi')])])
    const result = safeValidateCommentEditorState(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.root.children).toHaveLength(1)
    }
  })

  it('returns the zod error on failure', () => {
    const result = safeValidateCommentEditorState({ root: null })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })
})
