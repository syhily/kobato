import { describe, expect, it } from 'vitest'

import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { MUSIC_PLAYER_PROJECTION_PLACEHOLDER, toProjectionState } from '@/shared/lexical/projection-state'
import { lexicalEditorStateSchema, type LexicalEditorState } from '@/shared/lexical/schema'

// The transform operates on validated states (the save pipeline canonicalizes
// first); fixtures parse through the real schema so shape drift fails here.
function parse(state: unknown): LexicalEditorState {
  return lexicalEditorStateSchema.parse(state)
}

function paragraphText(node: unknown): string {
  const paragraph = node as { type: string; children: { text: string }[] }
  expect(paragraph.type).toBe('paragraph')
  return paragraph.children.map((child) => child.text).join('')
}

const MATH = { type: 'math', version: 1, tex: 'E=mc^2', mathml: '<math/>', svg: '<svg/>' }
const CODE = { type: 'codeblock', version: 1, code: 'x', language: 'ts', caption: '', highlightedHtml: '<span/>' }

describe('shared/lexical/projection-state — artifact stripping', () => {
  it('keeps the server-prerendered artifacts on the full-fidelity variant', () => {
    const state = parse(lexicalBodyWith([MATH, CODE, { ...MATH, type: 'math-inline' }]))
    const result = toProjectionState(state, { feed: false })
    const nodes = result.root.children as Record<string, unknown>[]
    expect(nodes[0]!.mathml).toBe('<math/>')
    expect(nodes[0]!.svg).toBe('<svg/>')
    expect(nodes[1]!.highlightedHtml).toBe('<span/>')
    expect(nodes[2]!.mathml).toBe('<math/>')
  })

  it('strips mathml/svg/highlightedHtml on the feed variant so inkling falls back to TeX/plain pre', () => {
    const state = parse(lexicalBodyWith([MATH, CODE, { ...MATH, type: 'math-inline' }]))
    const result = toProjectionState(state, { feed: true })
    const nodes = result.root.children as Record<string, unknown>[]
    expect(nodes[0]).toMatchObject({ mathml: '', svg: '', tex: 'E=mc^2' })
    expect(nodes[1]).toMatchObject({ highlightedHtml: '', code: 'x', language: 'ts' })
    expect(nodes[2]).toMatchObject({ mathml: '', svg: '' })
  })

  it('never mutates the input state', () => {
    const state = parse(lexicalBodyWith([MATH, CODE]))
    const snapshot = structuredClone(state)
    toProjectionState(state, { feed: true })
    expect(state).toEqual(snapshot)
  })
})

describe('shared/lexical/projection-state — host card substitution', () => {
  it('replaces a meta-carrying music-player with a labeled paragraph', () => {
    const state = parse(
      lexicalBodyWith([{ type: 'music-player', version: 1, playerId: 'p1', name: 'Song', artist: 'Artist' }]),
    )
    for (const feed of [false, true]) {
      const result = toProjectionState(state, { feed })
      expect(result.root.children).toHaveLength(1)
      expect(paragraphText(result.root.children[0])).toBe('🎵 Song — Artist')
    }
  })

  it('falls back to the PT feed placeholder when the meta snapshot is absent', () => {
    const state = parse(lexicalBodyWith([{ type: 'music-player', version: 1, playerId: 'p1' }]))
    const result = toProjectionState(state, { feed: false })
    expect(paragraphText(result.root.children[0])).toBe(MUSIC_PLAYER_PROJECTION_PLACEHOLDER)
  })

  it('drops solution and two-column cards (nested datasets undefined until R10)', () => {
    const state = parse(
      lexicalBodyWith([
        lexicalParagraph('before'),
        { type: 'solution', version: 1 },
        { type: 'two-column', version: 1 },
        lexicalParagraph('after'),
      ]),
    )
    const result = toProjectionState(state, { feed: false })
    expect(result.root.children.map((node) => node.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('passes registered host card types through untouched (the R10 evolution path)', () => {
    const state = parse(lexicalBodyWith([{ type: 'music-player', version: 1, playerId: 'p1', name: 'Song' }]))
    const result = toProjectionState(state, {
      feed: false,
      renderableHostCardTypes: new Set(['music-player']),
    })
    expect(result.root.children[0]!.type).toBe('music-player')
  })

  it('substitutes host cards nested inside element containers', () => {
    const state = parse(
      lexicalBodyWith([
        {
          type: 'extended-quote',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'music-player', version: 1, playerId: 'p1', name: 'Nested', artist: '' }],
        },
      ]),
    )
    const result = toProjectionState(state, { feed: false })
    const quote = result.root.children[0]!
    expect(quote.type).toBe('extended-quote')
    expect(paragraphText(quote.children![0])).toBe('🎵 Nested')
  })
})
