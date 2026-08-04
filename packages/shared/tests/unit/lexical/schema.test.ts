import type { LexicalBody, LexicalBlockNode } from '@kobato/shared/lexical/schema'

import { parseLexicalBody, safeParseLexicalBody } from '@kobato/shared/lexical/schema'
import { describe, expect, it } from 'vitest'

// Pin the in-repo Lexical 0.45.0 dialect. Every future editor save and
// every SSR render will parse through `lexicalBodySchema`, so drift here
// either lets malformed payloads land in `content.body` (the editor
// then silently corrupts pages) or rejects valid revisions (the public
// site goes blank). The constants below are the canonical shape every
// other layer should mirror — including the fields 0.45.0's
// `exportJSON` ALWAYS emits (`direction: null`, `format: ''`,
// `indent: 0`, paragraph `textFormat`/`textStyle`, link
// `rel`/`target`/`title` — `null` when unset — cell
// `backgroundColor`/`colSpan`/`headerState`/`rowSpan`, list
// `start`/`tag`, listitem `value`).

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
}

function body(children: unknown[] = []): unknown {
  return { root: { ...elementBase(), type: 'root', children } }
}

const FULL_BODY: unknown = body([
  paragraph([text('Hello '), text('world', 1)]),
  {
    ...elementBase(),
    type: 'heading',
    tag: 'h2',
    children: [text('Section')],
  },
  {
    ...elementBase(),
    type: 'quote',
    children: [paragraph([text('quoted')])],
  },
  {
    ...elementBase(),
    type: 'list',
    listType: 'bullet',
    start: 1,
    tag: 'ul',
    children: [
      {
        ...elementBase(),
        type: 'listitem',
        value: 1,
        children: [paragraph([text('item')])],
      },
    ],
  },
  paragraph([
    {
      ...elementBase(),
      type: 'link',
      url: 'https://example.com',
      rel: null,
      target: null,
      title: null,
      children: [text('docs')],
    },
  ]),
  {
    ...elementBase(),
    type: 'code',
    language: 'ts',
    children: [text('const a = 1')],
  },
  { type: 'image', version: 1, src: 'https://cdn.example/a.jpg', storagePath: 'images/2026/05/a.jpg', ptKey: 'i1' },
  { type: 'mathBlock', version: 1, tex: 'a^2', ptKey: 'm1' },
  paragraph([
    text('inline '),
    { type: 'mathInline', version: 1, tex: 'x', ptKey: 'mi1' },
    { type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 1, ptKey: 'fr1' },
  ]),
  { type: 'musicPlayer', version: 1, playerId: '7hk2pqrxyzabc012', ptKey: 'mp1' },
  { type: 'horizontalrule', version: 1 },
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
            headerState: 1,
            rowSpan: 1,
            children: [paragraph([text('cell')])],
          },
        ],
      },
    ],
  },
  {
    ...elementBase(),
    type: 'solution',
    ptKey: 'sol1',
    children: [paragraph([text('inside solution')])],
  },
  {
    ...elementBase(),
    type: 'twoColumn',
    ptKey: 'tc1',
    children: [
      { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('L')])] },
      { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('R')])] },
    ],
  },
  {
    ...elementBase(),
    type: 'footnoteDefinition',
    index: 1,
    ptKey: 'fn1',
    children: [paragraph([text('note body')])],
  },
])

describe('contract: lexical dialect — accepts the canonical node set', () => {
  it('parses every supported node type without errors', () => {
    expect(() => parseLexicalBody(FULL_BODY)).not.toThrow()
  })

  it('an empty body is valid (newly-created doc with no draft yet)', () => {
    expect(parseLexicalBody(body([]))).toEqual({ root: { ...elementBase(), type: 'root', children: [] } })
  })

  it('strips unknown fields per node type (whitelist semantics)', () => {
    const parsed = parseLexicalBody(
      body([
        {
          ...elementBase(),
          type: 'paragraph',
          children: [text('x')],
          textFormat: 0,
          textStyle: '',
          ptKey: 'should-be-stripped',
          meta: { junk: true },
        },
      ]),
    )
    const out = parsed.root.children[0] as unknown as Record<string, unknown>
    expect('ptKey' in out).toBe(false)
    expect('meta' in out).toBe(false)
  })

  it('keeps ptKey on the custom nodes', () => {
    const parsed = parseLexicalBody(body([{ type: 'image', version: 1, src: 'a', ptKey: 'i-1' }]))
    expect((parsed.root.children[0] as LexicalBlockNode).type === 'image').toBe(true)
  })
})

describe('contract: lexical dialect — rejects unknown shapes', () => {
  it('rejects an unknown node type', () => {
    expect(safeParseLexicalBody(body([{ type: 'mystery', version: 1 }])).ok).toBe(false)
  })

  it('rejects a text node with a format bitmask above 127', () => {
    // 0.45.0 defines bits up to 1024 (uppercase/capitalize); the dialect
    // pins the authored range to bold..superscript (1..64 combined).
    const bad = body([paragraph([text('x', 128)])])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a text node with a non-number format', () => {
    const bad = body([paragraph([{ ...text('x'), format: 'bold' }])])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects link urls with disallowed protocols, including control-char smuggling', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'java\tscript:alert(1)']) {
      const bad = body([
        {
          ...elementBase(),
          type: 'link',
          url,
          rel: null,
          target: null,
          title: null,
          children: [text('x')],
        },
      ])
      expect(safeParseLexicalBody(bad).ok).toBe(false)
    }
  })

  it('rejects an element node without the required base fields', () => {
    // `direction` / `format` / `indent` are always emitted by 0.45.0's
    // exportJSON; the gate requires them.
    const bad = body([{ type: 'paragraph', version: 1, children: [] }])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a node without a version', () => {
    const bad = body([{ type: 'horizontalrule' }])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a text node without text', () => {
    const bad = body([paragraph([{ detail: 0, format: 0, mode: 'normal', style: '', type: 'text', version: 1 }])])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a solution that nests another solution (containers only at root)', () => {
    const bad = body([
      {
        ...elementBase(),
        type: 'solution',
        children: [{ ...elementBase(), type: 'solution', children: [paragraph([text('nested')])] }],
      },
    ])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a footnoteDefinition that nests a solution', () => {
    const bad = body([
      {
        ...elementBase(),
        type: 'footnoteDefinition',
        index: 1,
        children: [{ ...elementBase(), type: 'solution', children: [paragraph([text('x')])] }],
      },
    ])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a twoColumn with a single pane', () => {
    const bad = body([
      {
        ...elementBase(),
        type: 'twoColumn',
        children: [{ ...elementBase(), type: 'twoColumnPane', side: 'left', children: [] }],
      },
    ])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a paragraph that nests a block container', () => {
    const bad = body([paragraph([{ ...elementBase(), type: 'heading', tag: 'h2', children: [text('x')] }])])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a listitem without the required value', () => {
    const bad = body([
      {
        ...elementBase(),
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        children: [{ ...elementBase(), type: 'listitem', children: [paragraph([])] }],
      },
    ])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('rejects a nested link inside a link', () => {
    const bad = body([
      paragraph([
        {
          ...elementBase(),
          type: 'link',
          url: 'https://example.com',
          rel: null,
          target: null,
          title: null,
          children: [
            {
              ...elementBase(),
              type: 'link',
              url: 'https://example.com',
              rel: null,
              target: null,
              title: null,
              children: [text('x')],
            },
          ],
        },
      ]),
    ])
    expect(safeParseLexicalBody(bad).ok).toBe(false)
  })

  it('accepts an empty body through the type guard', () => {
    const parsed: LexicalBody = parseLexicalBody(body([]))
    expect(parsed.root.children).toEqual([])
  })
})
