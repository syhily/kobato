import { describe, expect, it } from 'vitest'

import { lexicalStateToMarkdown, markdownToLexicalState } from '@/markdown/round-trip'

// The dialect speaks GFM pipe tables through the hand-written GFM_TABLE
// transformer (round-trip.ts) — @lexical/markdown 0.46 has no upstream TABLE
// transformer. Cells are inline-only by construction: cell markdown converts
// through the dialect's minimal inline set on import.
describe('Markdown round-trip: GFM tables', function () {
  function roundTrip(markdown: string) {
    return lexicalStateToMarkdown(markdownToLexicalState(markdown))
  }

  it('round-trips a pipe table one in, one out', function () {
    const markdown = '| a | b |\n| --- | --- |\n| c | d |'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips inline formatting and links in cells', function () {
    const markdown = '| **a** | [x](https://example.com) |\n| --- | --- |\n| c | d |'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips an escaped pipe inside a cell', function () {
    const markdown = '| a \\| b | c |\n| --- | --- |'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('marks the header row as first-row header cells in the tree', function () {
    const state = markdownToLexicalState('| a | b |\n| --- | --- |\n| c | d |')

    const table = state.root.children[0] as unknown as {
      type: string
      children: Array<{ children: Array<{ headerState: number }> }>
    }
    expect(table.type).toBe('table')
    expect(table.children[0].children.map((cell) => cell.headerState)).toEqual([1, 1])
    expect(table.children[1].children.map((cell) => cell.headerState)).toEqual([0, 0])
  })

  it('keeps surrounding blocks around the table', function () {
    const markdown = 'before\n\n| a |\n| --- |\n\nafter'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('leaves a pipe line without a divider as a literal paragraph', function () {
    const state = markdownToLexicalState('| a | b |')
    expect((state.root.children[0] as unknown as { type: string }).type).toBe('paragraph')
    expect(roundTrip('| a | b |')).toBe('| a | b |')
  })
})
