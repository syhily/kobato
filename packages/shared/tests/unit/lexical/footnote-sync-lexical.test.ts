import type { LexicalBody, LexicalFootnoteDefinitionNode, LexicalInlineNode } from '@kobato/shared/lexical/schema'

import {
  footnoteSyncSignatureLexical,
  synchronizeFootnoteIndicesLexical,
} from '@kobato/shared/lexical/footnote-sync-lexical'
import { describe, expect, it } from 'vitest'

// The lexical-track renumbering engine — cases ported 1:1 from the PT
// engine's suite (`shared/pt/footnote-sync.test.ts`).

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function textNode(text: string) {
  return { detail: 0, format: 0, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 as const }
}

function fnRef(targetKey: string, index: number, ptKey?: string) {
  return {
    type: 'footnoteRef' as const,
    version: 1 as const,
    targetKey,
    index,
    ...(ptKey !== undefined ? { ptKey } : {}),
  }
}

function fnDef(defKey: string, index: number, children: unknown[] = []): LexicalFootnoteDefinitionNode {
  return {
    ...elementBase(),
    type: 'footnoteDefinition',
    index,
    ptKey: defKey,
    children,
  } as LexicalFootnoteDefinitionNode
}

function tableCell(content: LexicalInlineNode[]) {
  return {
    ...elementBase(),
    type: 'tablecell' as const,
    backgroundColor: null,
    colSpan: 1,
    headerState: 0,
    rowSpan: 1,
    children: [paragraph(content)],
  }
}

function body(children: unknown[] = []): LexicalBody {
  return { root: { ...elementBase(), type: 'root', children } } as unknown as LexicalBody
}

describe('shared/lexical/footnote-sync-lexical — synchronizeFootnoteIndicesLexical', () => {
  it('returns the body unchanged when there are no footnote definitions', () => {
    const b = body([paragraph([textNode('no defs here')])])
    expect(synchronizeFootnoteIndicesLexical(b)).toBe(b)
  })

  it('returns the body unchanged when a ref targets a missing definition', () => {
    const b = body([paragraph([textNode('x'), fnRef('missing-key', 5)]), fnDef('other', 1)])
    expect(synchronizeFootnoteIndicesLexical(b)).toBe(b)
  })

  it('renumbers an orphan definition to 1', () => {
    const b = body([fnDef('d1', 99, [paragraph([textNode('body')])])])
    const result = synchronizeFootnoteIndicesLexical(b)
    const defs = result.root.children.filter((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode[]
    expect(defs.map((d) => d.index)).toEqual([1])
  })

  it('renumbers refs and definitions in first-citation order and moves defs to the end', () => {
    const b = body([
      paragraph([textNode('r2 '), fnRef('d2', 9, 'mk2'), textNode(' r1 '), fnRef('d1', 9, 'mk1')]),
      fnDef('d1', 7, [paragraph([textNode('one')])]),
      fnDef('d2', 8, [paragraph([textNode('two')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    expect(result.root.children.map((c) => c.type)).toEqual(['paragraph', 'footnoteDefinition', 'footnoteDefinition'])
    const defs = result.root.children.filter((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode[]
    expect(defs.map((d) => d.index)).toEqual([1, 2])
    const refs = (result.root.children[0] as { children: LexicalInlineNode[] }).children.filter(
      (c) => c.type === 'footnoteRef',
    )
    // d2 is cited before d1, so d2 renumbers to 1 and d1 to 2.
    expect(refs.map((r) => r.index)).toEqual([1, 2])
  })

  it('walks refs inside solution children', () => {
    const b = body([
      { ...elementBase(), type: 'solution' as const, children: [paragraph([textNode('x'), fnRef('sd', 3, 'mk1')])] },
      fnDef('sd', 9, [paragraph([textNode('sol footnote')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const def = result.root.children.find((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode
    expect(def.index).toBe(1)
  })

  it('walks refs inside twoColumn left and right panes', () => {
    const b = body([
      {
        ...elementBase(),
        type: 'twoColumn' as const,
        children: [
          {
            ...elementBase(),
            type: 'twoColumnPane' as const,
            side: 'left',
            children: [paragraph([textNode('l'), fnRef('ld', 4, 'mk1')])],
          },
          {
            ...elementBase(),
            type: 'twoColumnPane' as const,
            side: 'right',
            children: [paragraph([textNode('r'), fnRef('rd', 5, 'mk2')])],
          },
        ],
      },
      fnDef('ld', 8, [paragraph([textNode('left')])]),
      fnDef('rd', 7, [paragraph([textNode('right')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const defs = result.root.children.filter((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode[]
    expect(defs.map((d) => d.index)).toEqual([1, 2])
  })

  it('walks refs inside table cells', () => {
    const b = body([
      {
        ...elementBase(),
        type: 'table' as const,
        children: [
          {
            ...elementBase(),
            type: 'tablerow' as const,
            children: [tableCell([textNode('cell '), fnRef('td', 6, 'mk1')])],
          },
        ],
      },
      fnDef('td', 9, [paragraph([textNode('table fn')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const def = result.root.children.find((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode
    expect(def.index).toBe(1)
    const outTable = result.root.children[0] as {
      children: Array<{ children: Array<{ children: Array<{ children: LexicalInlineNode[] }> }> }>
    }
    const cellRefs = outTable.children[0]!.children[0]!.children[0]!.children.filter((c) => c.type === 'footnoteRef')
    expect(cellRefs.map((r) => r.index)).toEqual([1])
  })

  it('keeps the second occurrence of a citation at the same index (dedup)', () => {
    const b = body([
      paragraph([textNode('a'), fnRef('dd', 1, 'mk1')]),
      paragraph([textNode('b'), fnRef('dd', 1, 'mk2')]),
      fnDef('dd', 9, [paragraph([textNode('once')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const def = result.root.children.find((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode
    expect(def.index).toBe(1)
    const refs = result.root.children
      .filter((c) => c.type === 'paragraph')
      .flatMap((c) => (c as { children: LexicalInlineNode[] }).children)
      .filter((c) => c.type === 'footnoteRef')
    expect(refs.map((r) => r.index)).toEqual([1, 1])
  })

  it('appends orphan definitions after cited ones, sorted by index', () => {
    const b = body([
      paragraph([textNode('x'), fnRef('cited', 1, 'mk1')]),
      fnDef('orphan2', 2, [paragraph([textNode('o2')])]),
      fnDef('orphan1', 1, [paragraph([textNode('o1')])]),
      fnDef('cited', 9, [paragraph([textNode('c')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const defs = result.root.children.filter((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode[]
    expect(defs.map((d) => d.index)).toEqual([1, 2, 3])
    expect(defs.map((d) => d.ptKey)).toEqual(['cited', 'orphan2', 'orphan1'])
  })

  it('renumbers footnoteRef nodes nested inside a definition own children', () => {
    const b = body([
      fnDef('target', 9, [paragraph([textNode('real note')])]),
      fnDef('carrier', 8, [paragraph([textNode('x'), fnRef('target', 7, 'mk1')])]),
    ])
    const result = synchronizeFootnoteIndicesLexical(b)
    const defs = result.root.children.filter((c) => c.type === 'footnoteDefinition') as LexicalFootnoteDefinitionNode[]
    expect(defs.map((d) => [d.ptKey, d.index])).toEqual([
      ['target', 1],
      ['carrier', 2],
    ])
    const carrier = defs.find((d) => d.ptKey === 'carrier')!
    const carrierParagraph = carrier.children[0] as { children: LexicalInlineNode[] }
    const ref = carrierParagraph.children.find((c) => c.type === 'footnoteRef')!
    expect(ref.index).toBe(1)
  })

  it('does not mutate the input body', () => {
    const b = body([paragraph([textNode('x'), fnRef('d1', 9, 'mk1')]), fnDef('d1', 7, [paragraph([textNode('one')])])])
    const snapshot = JSON.stringify(b)
    synchronizeFootnoteIndicesLexical(b)
    expect(JSON.stringify(b)).toBe(snapshot)
  })

  it('skips renumbering when a ref index already equals the new index', () => {
    const b = body([paragraph([textNode('y'), fnRef('eq', 1, 'mk1')]), fnDef('eq', 1, [paragraph([textNode('z')])])])
    const before = JSON.stringify(b)
    const result = synchronizeFootnoteIndicesLexical(b)
    expect(JSON.stringify(result)).toBe(before)
  })
})

describe('shared/lexical/footnote-sync-lexical — footnoteSyncSignatureLexical', () => {
  it('encodes inline occurrences and sorted definitions into a stable string', () => {
    const b = body([
      paragraph([textNode('a'), fnRef('a', 1, 'mk1')]),
      paragraph([textNode('b'), fnRef('b', 2, 'mk2')]),
      fnDef('b', 2, [paragraph([textNode('two')])]),
      fnDef('a', 1, [paragraph([textNode('one')])]),
    ])
    const sig = footnoteSyncSignatureLexical(b)
    const [occPart, defPart] = sig.split('\u001e')
    expect(occPart).toBe('a:1\u001fb:2')
    expect(defPart).toBe('a@1\u001fb@2')
  })

  it('emits empty occurrence list when only definitions exist', () => {
    const b = body([fnDef('solo', 1, [paragraph([textNode('x')])])])
    const sig = footnoteSyncSignatureLexical(b)
    const [occPart, defPart] = sig.split('\u001e')
    expect(occPart).toBe('')
    expect(defPart).toBe('solo@1')
  })
})
