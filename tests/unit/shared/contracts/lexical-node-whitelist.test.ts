import { describe, expect, it } from 'vitest'

import { commentEditorStateSchema } from '@/shared/lexical/comment-schema'
import { ARTICLE_COMPOSER_NODE_TYPES, COMMENT_COMPOSER_NODE_TYPES } from '@/shared/lexical/composer-nodes'
import { COMMENT_NODE_TYPES, FULL_EDITOR_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// Contract (plan docs/plans/inkling-editor-replacement.md, R7): the two zod
// schemas, the node-whitelist constants, and the composer-mounted node sets
// must stay three-way identical — the editor must never produce a node the
// server rejects, nor accept one it cannot produce. Until the composers
// land (R11/R12), `composer-nodes.ts` is a placeholder manifest mirroring
// the whitelist; R11 swaps in the real composer node sets (consuming the
// same constants) and this test then pins the real three-way contract.

function element(type: string, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { type, version: 1, children, direction: 'ltr', format: '', indent: 0, ...extra }
}

function textFields(extra: Record<string, unknown> = {}) {
  return { detail: 0, format: 0, mode: 'normal', style: '', text: 'x', ...extra }
}

function state(children: unknown[]) {
  return { root: element('root', children) }
}

// Minimal valid payload per whitelisted type — the fixture table's key set
// is itself pinned against the whitelist below, so a whitelist entry
// without a fixture (or vice versa) fails the contract.
const MINIMAL_NODE_FIXTURES: Record<string, () => Record<string, unknown>> = {
  paragraph: () => element('paragraph'),
  linebreak: () => ({ type: 'linebreak', version: 1 }),
  'extended-text': () => ({ type: 'extended-text', version: 1, ...textFields() }),
  'extended-heading': () => element('extended-heading', [], { tag: 'h2' }),
  'extended-quote': () => element('extended-quote'),
  list: () => element('list', [], { listType: 'bullet', start: 1, tag: 'ul' }),
  listitem: () => element('listitem', [], { value: 1 }),
  link: () => element('link', [], { url: 'https://example.com' }),
  autolink: () => element('autolink', [], { url: 'https://example.com' }),
  image: () => ({
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
  }),
  codeblock: () => ({ type: 'codeblock', version: 1, code: '', language: '', caption: '', highlightedHtml: '' }),
  math: () => ({ type: 'math', version: 1, tex: '', mathml: '', svg: '' }),
  'math-inline': () => ({ type: 'math-inline', version: 1, tex: '', mathml: '', svg: '' }),
  'footnote-ref': () => ({ type: 'footnote-ref', version: 1, ...textFields(), targetKey: 'fn-1' }),
  footnotedefinition: () => ({
    type: 'footnotedefinition',
    version: 1,
    content: '',
    targetKey: 'fn-1',
    index: 1,
  }),
  horizontalrule: () => ({ type: 'horizontalrule', version: 1 }),
  table: () => element('table'),
  tablerow: () => element('tablerow'),
  tablecell: () => element('tablecell', [], { headerState: 0 }),
  solution: () => ({ type: 'solution', version: 1, content: '' }),
  'two-column': () => ({ type: 'two-column', version: 1, left: '', right: '' }),
  'music-player': () => ({ type: 'music-player', version: 1, playerId: 'p1' }),
}

const sorted = (values: readonly string[]) => [...values].sort()

describe('contract: lexical node whitelist', () => {
  it('covers every full-whitelist type with a minimal fixture', () => {
    expect(sorted(Object.keys(MINIMAL_NODE_FIXTURES))).toEqual(sorted(FULL_EDITOR_NODE_TYPES))
  })

  it('accepts every whitelisted type in the full editing state', () => {
    for (const type of FULL_EDITOR_NODE_TYPES) {
      const node = MINIMAL_NODE_FIXTURES[type]()
      expect(lexicalEditorStateSchema.safeParse(state([node])).success, type).toBe(true)
    }
  })

  it('rejects types outside the full whitelist', () => {
    // Upstream base types replaced by inkling's extended nodes, PT-spelling
    // leftovers, inkling nodes kobato does not mount, and the root type.
    for (const node of [
      { type: 'text', version: 1, ...textFields() },
      element('heading', [], { tag: 'h1' }),
      element('quote'),
      element('root'),
      { type: 'tab', version: 1, ...textFields() },
      { type: 'tk', version: 1, ...textFields() },
      element('aside'),
      { type: 'musicPlayer', version: 1, playerId: 'p1' },
      { type: 'twoColumn', version: 1 },
    ]) {
      expect(lexicalEditorStateSchema.safeParse(state([node])).success, (node as { type: string }).type).toBe(false)
    }
  })

  it('accepts exactly the comment subset in the comment state', () => {
    for (const type of COMMENT_NODE_TYPES) {
      const node = MINIMAL_NODE_FIXTURES[type]()
      expect(commentEditorStateSchema.safeParse(state([node])).success, type).toBe(true)
    }
    const commentSet = new Set<string>(COMMENT_NODE_TYPES)
    const fullOnly = FULL_EDITOR_NODE_TYPES.filter((type) => !commentSet.has(type))
    expect(fullOnly.length).toBeGreaterThan(0)
    for (const type of fullOnly) {
      const node = MINIMAL_NODE_FIXTURES[type]()
      expect(commentEditorStateSchema.safeParse(state([node])).success, type).toBe(false)
    }
  })

  it('pins the composer manifests to the whitelist constants', () => {
    // R7 placeholder equivalence — R11 replaces the manifests with the real
    // composer node sets; this assertion must keep passing after the swap.
    expect(sorted(ARTICLE_COMPOSER_NODE_TYPES)).toEqual(sorted(FULL_EDITOR_NODE_TYPES))
    expect(sorted(COMMENT_COMPOSER_NODE_TYPES)).toEqual(sorted(COMMENT_NODE_TYPES))
  })

  it('keeps the comment whitelist a strict subset of the full whitelist', () => {
    const fullSet = new Set<string>(FULL_EDITOR_NODE_TYPES)
    for (const type of COMMENT_NODE_TYPES) {
      expect(fullSet.has(type), type).toBe(true)
    }
  })
})
