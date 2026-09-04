import { describe, expect, it } from 'vitest'

import { ARTICLE_LIST_MAX_DEPTH, lexicalEditorStateSchema, MAX_TREE_DEPTH } from '@/shared/lexical/schema'

// Fixtures pin the storage wire shape the inkling composer produces —
// element nodes always carry children/direction/format/indent, text nodes
// carry detail/format/mode/style/text (lexical 0.46 exporters).

function element(type: string, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { type, version: 1, children, direction: 'ltr', format: '', indent: 0, ...extra }
}

function text(value: string, extra: Record<string, unknown> = {}) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: value, ...extra }
}

function state(children: unknown[]) {
  return { root: element('root', children) }
}

/** `depth` nested lists (list > listitem > list > …), leaf item holds text. */
function nestedList(depth: number): unknown {
  const item = element('listitem', depth === 1 ? [text('item')] : [nestedList(depth - 1)], { value: 1 })
  return element('list', [item], { listType: 'bullet', start: 1, tag: 'ul' })
}

/** Paragraphs nested `depth` levels — structurally odd but type-valid,
 * which is exactly what the depth-bomb guard must bound. */
function nestedParagraphs(depth: number): unknown {
  return depth === 1 ? element('paragraph', [text('leaf')]) : element('paragraph', [nestedParagraphs(depth - 1)])
}

function imageNode(extra: Record<string, unknown> = {}) {
  return {
    type: 'image',
    version: 1,
    src: '/storage/posts/cover.png',
    caption: '',
    title: '',
    alt: 'cover',
    cardWidth: 'regular',
    width: 800,
    height: 600,
    href: '',
    ...extra,
  }
}

describe('lexicalEditorStateSchema', () => {
  it('accepts a rich valid article state covering every whitelisted node family', () => {
    const value = state([
      element('extended-heading', [text('Title')], { tag: 'h2' }),
      element('paragraph', [
        text('Hello '),
        element('link', [text('site')], { url: 'https://example.com', rel: 'noopener', target: '_blank' }),
        element('autolink', [text('https://example.com')], { url: 'https://example.com', isUnlinked: false }),
        { ...text('1'), type: 'footnote-ref', targetKey: 'fn-1' },
        { type: 'math-inline', version: 1, tex: 'x^2', mathml: '<math/>', svg: '' },
        { type: 'linebreak', version: 1 },
      ]),
      element('extended-quote', [element('paragraph', [text('quoted')])]),
      nestedList(4),
      imageNode({ thumbhash: 'th', storagePath: 'posts/cover.png', imageId: 'img-1', layout: 'left' }),
      {
        type: 'codeblock',
        version: 1,
        code: 'const a = 1',
        language: 'ts',
        caption: '',
        highlightedHtml: '<pre class="shiki"/>',
      },
      { type: 'math', version: 1, tex: 'E=mc^2', mathml: '<math/>', svg: '<svg/>' },
      { type: 'horizontalrule', version: 1 },
      element('table', [
        element('tablerow', [
          element('tablecell', [element('paragraph', [text('h')])], { headerState: 1 }),
          element('tablecell', [element('paragraph', [text('d')])], { headerState: 0, colSpan: 2 }),
        ]),
      ]),
      { type: 'footnotedefinition', version: 1, content: '<p>note</p>', targetKey: 'fn-1', index: 1 },
      // R10 host cards carry their full datasets (spec modules in
      // `@/shared/lexical/cards/`).
      { type: 'solution', version: 1, content: '<p>answer</p>' },
      { type: 'two-column', version: 1, left: '<p>L</p>', right: '<p>R</p>' },
      {
        type: 'music-player',
        version: 1,
        playerId: 'p1',
        name: 'song',
        artist: 'artist',
        cover: '/storage/cover.png',
        audioUrl: '/storage/song.mp3',
        lyric: '[00:00] la',
      },
    ])
    const result = lexicalEditorStateSchema.safeParse(value)
    expect(result.success).toBe(true)
  })

  it('accepts a meta-less music-player node (canonicalize strip / failed resolve shape)', () => {
    expect(
      lexicalEditorStateSchema.safeParse(state([{ type: 'music-player', version: 1, playerId: 'p1' }])).success,
    ).toBe(true)
  })

  it('rejects host cards with missing or mistyped dataset keys', () => {
    // solution requires the nested-editor HTML string.
    expect(lexicalEditorStateSchema.safeParse(state([{ type: 'solution', version: 1 }])).success).toBe(false)
    // two-column requires both panes.
    expect(lexicalEditorStateSchema.safeParse(state([{ type: 'two-column', version: 1, left: '<p/>' }])).success).toBe(
      false,
    )
    expect(
      lexicalEditorStateSchema.safeParse(state([{ type: 'two-column', version: 1, left: 1, right: '<p/>' }])).success,
    ).toBe(false)
    // music-player requires playerId; meta keys must be strings when present.
    expect(lexicalEditorStateSchema.safeParse(state([{ type: 'music-player', version: 1 }])).success).toBe(false)
    expect(
      lexicalEditorStateSchema.safeParse(state([{ type: 'music-player', version: 1, playerId: 'p1', name: 42 }]))
        .success,
    ).toBe(false)
  })

  it('rejects node types outside the whitelist', () => {
    for (const type of ['text', 'heading', 'quote', 'musicPlayer', 'tk', 'aside', 'html', 'toggle', 'nope']) {
      const node = { ...element(type), tag: 'h1', text: 'x', detail: 0, format: 0, mode: 'normal', style: '' }
      expect(lexicalEditorStateSchema.safeParse(state([node])).success, type).toBe(false)
    }
  })

  it('rejects a root node nested as a child', () => {
    expect(lexicalEditorStateSchema.safeParse(state([element('root')])).success).toBe(false)
  })

  it('rejects malformed states', () => {
    expect(lexicalEditorStateSchema.safeParse(null).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse('state').success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse([]).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse({}).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse({ root: null }).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse({ root: element('paragraph') }).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse({ root: { type: 'root', version: 1, children: {} } }).success).toBe(false)
    // node missing required fields
    expect(lexicalEditorStateSchema.safeParse(state([{ type: 'paragraph' }])).success).toBe(false)
    expect(
      lexicalEditorStateSchema.safeParse(state([{ type: 'paragraph', version: 1, children: [], indent: 0 }])).success,
    ).toBe(false)
  })

  it('validates the shared text-node fields', () => {
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [text('ok')])])).success).toBe(true)
    expect(
      lexicalEditorStateSchema.safeParse(state([element('paragraph', [text('x', { mode: 'weird' })])])).success,
    ).toBe(false)
    expect(
      lexicalEditorStateSchema.safeParse(state([element('paragraph', [text('x', { detail: 'bold' })])])).success,
    ).toBe(false)
    // missing `style`
    const { style: _style, ...noStyle } = text('x')
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [noStyle])])).success).toBe(false)
  })

  it('refines link urls through the safe-url policy', () => {
    const bad = element('link', [text('x')], { url: 'javascript:alert(1)' })
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [bad])])).success).toBe(false)
    const badAuto = element('autolink', [text('x')], { url: 'data:text/html,<script/>' })
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [badAuto])])).success).toBe(false)
  })

  it('validates the image dataset including the kobato pass-through keys', () => {
    expect(lexicalEditorStateSchema.safeParse(state([imageNode()])).success).toBe(true)
    expect(lexicalEditorStateSchema.safeParse(state([imageNode({ width: '800' })])).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse(state([imageNode({ width: -1 })])).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse(state([imageNode({ cardWidth: 'huge' })])).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse(state([imageNode({ layout: 'float' })])).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse(state([imageNode({ thumbhash: 42 })])).success).toBe(false)
  })

  it('validates the footnote pair', () => {
    const ref = { ...text('2'), type: 'footnote-ref', targetKey: 'fn-2' }
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [ref])])).success).toBe(true)
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [{ ...ref, targetKey: '' }])])).success).toBe(
      false,
    )
    const { targetKey: _targetKey, ...noKey } = ref
    expect(lexicalEditorStateSchema.safeParse(state([element('paragraph', [noKey])])).success).toBe(false)

    const definition = { type: 'footnotedefinition', version: 1, content: '<p>note</p>', targetKey: 'fn-2', index: 2 }
    expect(lexicalEditorStateSchema.safeParse(state([definition])).success).toBe(true)
    expect(lexicalEditorStateSchema.safeParse(state([{ ...definition, index: 0 }])).success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse(state([{ ...definition, content: 1 }])).success).toBe(false)
  })

  it('allows article lists to the PT-parity depth and rejects one level deeper', () => {
    expect(lexicalEditorStateSchema.safeParse(state([nestedList(ARTICLE_LIST_MAX_DEPTH)])).success).toBe(true)
    expect(lexicalEditorStateSchema.safeParse(state([nestedList(ARTICLE_LIST_MAX_DEPTH + 1)])).success).toBe(false)
  })

  it('bounds the recursive descent on over-nested payloads', () => {
    expect(lexicalEditorStateSchema.safeParse(state([nestedParagraphs(10)])).success).toBe(true)
    expect(lexicalEditorStateSchema.safeParse(state([nestedParagraphs(MAX_TREE_DEPTH + 6)])).success).toBe(false)
  })

  it('keeps validating deep inside nested structures', () => {
    const deep = element('table', [
      element('tablerow', [
        element('tablecell', [element('paragraph', [element('link', [text('x')], { url: 'vbscript:x' })])], {
          headerState: 0,
        }),
      ]),
    ])
    expect(lexicalEditorStateSchema.safeParse(state([deep])).success).toBe(false)
  })
})
