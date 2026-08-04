import {
  isEmptyLexicalCommentBody,
  isLexicalCommentBodyBlank,
  parseLexicalCommentBody,
  safeParseLexicalCommentBody,
} from '@kobato/shared/lexical/comment-schema'
import { describe, expect, it } from 'vitest'

// Pin the comment dialect gate. Every future comment save and every
// comment render will parse through `lexicalCommentBodySchema`, so drift
// here either lets out-of-dialect payloads land in comments (the editor
// then silently corrupts them) or rejects valid comment bodies (the
// save path breaks). The comment subset vs. the full body dialect:
// no headings / images / hr / music / tables / solution / twoColumn /
// footnotes; lists `bullet`/`number` only, nested ≤ 4 levels.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
}

function link(url: string, children: unknown[] = [text('link')]) {
  return { ...elementBase(), type: 'link' as const, url, rel: null, target: null, title: null, children }
}

function quote(children: unknown[]) {
  return { ...elementBase(), type: 'quote' as const, children }
}

function list(
  listType: 'bullet' | 'number' | 'check',
  items: unknown[],
  tag: 'ul' | 'ol' | 'check' = listType === 'bullet' ? 'ul' : 'ol',
) {
  return { ...elementBase(), type: 'list' as const, listType, start: 1, tag, children: items }
}

function listItem(children: unknown[], value = 1) {
  return { ...elementBase(), type: 'listitem' as const, value, children }
}

function codeBlock(children: unknown[] = [text('const a = 1')], language?: string) {
  return { ...elementBase(), type: 'code' as const, ...(language !== undefined ? { language } : {}), children }
}

function mathBlock(tex: string) {
  return { type: 'mathBlock' as const, version: 1, tex }
}

function body(children: unknown[] = []): unknown {
  return { root: { ...elementBase(), type: 'root', children } }
}

/** A list nesting `depth` levels deep (root list = depth 1). */
function nestedList(depth: number, listType: 'bullet' | 'number' = 'bullet'): unknown {
  let inner: unknown = paragraph([text('deep')])
  for (let level = depth; level >= 1; level -= 1) {
    inner = list(listType, [listItem([inner])], listType === 'bullet' ? 'ul' : 'ol')
  }
  return inner
}

const FULL_COMMENT_BODY: unknown = body([
  paragraph([
    text('Hello '),
    text('world', 1 + 2 + 4 + 8),
    text(' code', 16),
    link('https://example.com', [text('docs')]),
    { type: 'linebreak', version: 1 },
    { type: 'mathInline', version: 1, tex: 'a^2', ptKey: 'mi1' },
  ]),
  quote([paragraph([text('quoted')])]),
  nestedList(4),
  codeBlock([text('const a = 1')], 'ts'),
  mathBlock('a^2'),
])

describe('shared/lexical/comment-schema', () => {
  it('accepts a full comment-dialect body and strips unknown fields', () => {
    const parsed = parseLexicalCommentBody(FULL_COMMENT_BODY)
    expect(parsed.root.children.map((child) => child.type)).toEqual(['paragraph', 'quote', 'list', 'code', 'mathBlock'])
    const p = parsed.root.children[0]
    expect(p.type).toBe('paragraph')
    if (p.type !== 'paragraph') {
      return
    }
    expect(p.children.map((child) => child.type)).toEqual(['text', 'text', 'text', 'link', 'linebreak', 'mathInline'])
    // Unknown fields are stripped (whitelist semantics).
    const withExtra = paragraph([text('x')])
    ;(withExtra as unknown as Record<string, unknown>).bogus = 'drop-me'
    const cleaned = parseLexicalCommentBody(body([withExtra]))
    expect('bogus' in (cleaned.root.children[0] as unknown as Record<string, unknown>)).toBe(false)
  })

  it('rejects out-of-dialect blocks at the root', () => {
    const rejected: Record<string, unknown>[] = [
      { ...elementBase(), type: 'heading', tag: 'h2', children: [text('Section')] },
      { type: 'image', version: 1, src: 'https://cdn.example/a.jpg' },
      { type: 'horizontalrule', version: 1 },
      { type: 'musicPlayer', version: 1, playerId: 'abc123' },
      {
        ...elementBase(),
        type: 'table',
        children: [
          {
            ...elementBase(),
            type: 'tablerow',
            children: [
              {
                ...elementBase(),
                type: 'tablecell',
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                children: [paragraph([text('cell')])],
              },
            ],
          },
        ],
      },
      { ...elementBase(), type: 'solution', children: [paragraph([text('x')])] },
      {
        ...elementBase(),
        type: 'twoColumn',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('L')])] },
          { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('R')])] },
        ],
      },
      { ...elementBase(), type: 'footnoteDefinition', index: 1, children: [paragraph([text('fn')])] },
    ]
    for (const block of rejected) {
      expect(safeParseLexicalCommentBody(body([block])).ok, `expected reject: ${String(block.type)}`).toBe(false)
    }
  })

  it('rejects footnoteRef inside a paragraph', () => {
    const result = safeParseLexicalCommentBody(
      body([paragraph([text('x'), { type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 1 }])]),
    )
    expect(result.ok).toBe(false)
  })

  it('accepts list nesting up to depth 4 and rejects depth 5', () => {
    expect(safeParseLexicalCommentBody(body([nestedList(4)])).ok).toBe(true)
    const tooDeep = safeParseLexicalCommentBody(body([nestedList(5)]))
    expect(tooDeep.ok).toBe(false)
  })

  it('accepts both listitem children forms: inline runtime shape and the paragraph alias', () => {
    // The 0.45 runtime shape — the list conversion appends the text
    // directly into the item (`ListItemNode.append` unwraps paragraphs).
    const runtime = safeParseLexicalCommentBody(
      body([
        list('bullet', [listItem([text('item'), link('https://example.com'), { type: 'linebreak', version: 1 }])]),
      ]),
    )
    expect(runtime.ok).toBe(true)
    // The PT→Lexical mapping alias — paragraph children; a parse
    // round-trip flattens it back to inlines.
    const mapping = safeParseLexicalCommentBody(body([list('bullet', [listItem([paragraph([text('item')])])])]))
    expect(mapping.ok).toBe(true)
    // Nested list next to an inline run — the editor's indented-item shape.
    const nested = safeParseLexicalCommentBody(body([list('bullet', [listItem([text('outer'), nestedList(2)])])]))
    expect(nested.ok).toBe(true)
  })

  it('rejects `check` lists (comment dialect is bullet/number only)', () => {
    const result = safeParseLexicalCommentBody(body([list('check', [listItem([paragraph([text('todo')])])], 'check')]))
    expect(result.ok).toBe(false)
  })

  it('rejects unsafe link URLs and out-of-range text format bitmasks', () => {
    expect(safeParseLexicalCommentBody(body([paragraph([link('javascript:alert(1)')])])).ok).toBe(false)
    expect(safeParseLexicalCommentBody(body([paragraph([text('x', 128)])])).ok).toBe(false)
  })

  it('rejects structurally impossible trees', () => {
    // quote children must be paragraphs
    expect(safeParseLexicalCommentBody(body([quote([text('bare')])])).ok).toBe(false)
    // code children must be text nodes
    expect(safeParseLexicalCommentBody(body([codeBlock([paragraph([text('x')])])])).ok).toBe(false)
    // listitem children must be paragraph / nested list
    expect(
      safeParseLexicalCommentBody(
        body([list('bullet', [listItem([{ ...elementBase(), type: 'quote', children: [] }])])]),
      ).ok,
    ).toBe(false)
    // link children must be text / linebreak / mathInline
    expect(
      safeParseLexicalCommentBody(
        body([paragraph([link('https://example.com', [text('a'), { type: 'image', version: 1, src: 'x' }])])]),
      ).ok,
    ).toBe(false)
  })

  it('safeParse returns ok/false envelopes', () => {
    expect(safeParseLexicalCommentBody(FULL_COMMENT_BODY).ok).toBe(true)
    const failure = safeParseLexicalCommentBody(body([{ ...elementBase(), type: 'heading', tag: 'h1', children: [] }]))
    expect(failure.ok).toBe(false)
    if (!failure.ok) {
      expect(failure.error).toBeInstanceOf(Error)
    }
  })

  it('isEmptyLexicalCommentBody detects empty / all-empty-paragraph documents', () => {
    expect(isEmptyLexicalCommentBody(parseLexicalCommentBody(body([])))).toBe(true)
    expect(isEmptyLexicalCommentBody(parseLexicalCommentBody(body([paragraph([])])))).toBe(true)
    expect(isEmptyLexicalCommentBody(parseLexicalCommentBody(body([paragraph([text('x')])])))).toBe(false)
    expect(isEmptyLexicalCommentBody(parseLexicalCommentBody(body([mathBlock('x')])))).toBe(false)
  })

  it('isLexicalCommentBodyBlank mirrors the PT blank semantics', () => {
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([])))).toBe(true)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([paragraph([text('   ')])])))).toBe(true)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([paragraph([text('  x ')])])))).toBe(false)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([codeBlock([text('  ')])])))).toBe(true)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([codeBlock([text('const')])])))).toBe(false)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([mathBlock('  ')])))).toBe(true)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([mathBlock('a^2')])))).toBe(false)
    expect(isLexicalCommentBodyBlank(parseLexicalCommentBody(body([quote([paragraph([text(' q ')])])])))).toBe(false)
    expect(
      isLexicalCommentBodyBlank(
        parseLexicalCommentBody(body([list('bullet', [listItem([paragraph([text(' item ')])])])])),
      ),
    ).toBe(false)
    // mathInline contributes its TeX to the blank check.
    expect(
      isLexicalCommentBodyBlank(
        parseLexicalCommentBody(body([paragraph([{ type: 'mathInline', version: 1, tex: 'x' }])])),
      ),
    ).toBe(false)
  })
})
