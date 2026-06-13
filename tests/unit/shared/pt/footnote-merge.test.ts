import { describe, expect, it } from 'vitest'

import type { FootnoteDefinitionBlock, PortableTextBody } from '@/shared/pt/schema'

import {
  extractFootnoteDefinitionBlocks,
  footnoteChildrenToPlainText,
  mergeProseBodyWithFootnoteDefinitions,
  plainTextToFootnoteChildren,
  stripFootnoteDefinitionsForEditor,
} from '@/shared/pt/footnote-merge'

const text = (t: string) => ({
  _type: 'block' as const,
  _key: `b-${t}`,
  style: 'normal' as const,
  children: [{ _type: 'span' as const, _key: `s-${t}`, text: t }],
})

const footnoteDef = (key: string, idx: number, body: string): FootnoteDefinitionBlock => ({
  _type: 'footnoteDefinition',
  _key: key,
  index: idx,
  children: [text(body)],
})

describe('shared/pt/footnote-merge — extractFootnoteDefinitionBlocks', () => {
  it('returns only footnoteDefinition blocks', () => {
    const body: PortableTextBody = [text('a'), footnoteDef('f1', 1, 'note'), text('b')]
    expect(extractFootnoteDefinitionBlocks(body)).toHaveLength(1)
    expect(extractFootnoteDefinitionBlocks(body)[0]._key).toBe('f1')
  })

  it('returns empty when no definitions present', () => {
    expect(extractFootnoteDefinitionBlocks([text('a')])).toEqual([])
  })
})

describe('shared/pt/footnote-merge — stripFootnoteDefinitionsForEditor', () => {
  it('removes footnoteDefinition blocks from the body', () => {
    const body: PortableTextBody = [text('a'), footnoteDef('f1', 1, 'note'), text('b')]
    expect(stripFootnoteDefinitionsForEditor(body)).toEqual([text('a'), text('b')])
  })
})

describe('shared/pt/footnote-merge — mergeProseBodyWithFootnoteDefinitions', () => {
  it('concatenates prose with defs and runs index synchronisation', () => {
    const prose: PortableTextBody = [text('a')]
    const defs = [footnoteDef('f1', 99, 'note')]
    const merged = mergeProseBodyWithFootnoteDefinitions(prose, defs)
    expect(merged).toHaveLength(2)
    expect(merged[1]).toMatchObject({ _type: 'footnoteDefinition', index: 1 })
  })
})

describe('shared/pt/footnote-merge — plainTextToFootnoteChildren', () => {
  it('splits text into one block per line', () => {
    const children = plainTextToFootnoteChildren('first\nsecond\nthird')
    expect(children).toHaveLength(3)
    expect((children[0] as { children: { text: string }[] }).children[0].text).toBe('first')
    expect((children[2] as { children: { text: string }[] }).children[0].text).toBe('third')
  })

  it('produces a single empty-text block for empty input', () => {
    const children = plainTextToFootnoteChildren('')
    expect(children).toHaveLength(1)
    expect((children[0] as { children: { text: string }[] }).children[0].text).toBe('')
  })

  it('trims trailing whitespace before splitting', () => {
    const children = plainTextToFootnoteChildren('hi\n   ')
    expect(children).toHaveLength(1)
  })
})

describe('shared/pt/footnote-merge — footnoteChildrenToPlainText', () => {
  it('joins span texts with newlines across blocks', () => {
    const children = plainTextToFootnoteChildren('first\nsecond')
    expect(footnoteChildrenToPlainText(children)).toBe('first\nsecond')
  })

  it('skips non-block children', () => {
    const children = [{ _type: 'image', _key: 'i', src: 'x' }, ...plainTextToFootnoteChildren('hello')] as never
    expect(footnoteChildrenToPlainText(children)).toBe('hello')
  })

  it('returns empty string when no blocks present', () => {
    expect(footnoteChildrenToPlainText([])).toBe('')
  })
})
