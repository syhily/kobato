import type {
  FootnoteDefinitionBlock,
  NonRecursiveBlock,
  PortableTextBody,
  TableCell,
  TableRow,
} from '@kobato/shared/legacy-pt/schema'

import { footnoteSyncSignature, synchronizeFootnoteIndices } from '@kobato/shared/legacy-pt/footnote-sync'
import { describe, expect, it } from 'vitest'

// The renumbering engine's home is `@kobato/shared/pt/footnote-sync` (pure PT-tree
// semantics) — the bridge node module keeps only the PM↔PT converters.

// --- fixture helpers ------------------------------------------------------

let keyCounter = 0
function key(prefix: string): string {
  keyCounter += 1
  return `${prefix}${keyCounter}`
}

function textBlock(text: string, marks?: string[], markDefs?: unknown[]): NonRecursiveBlock {
  return {
    _type: 'block',
    _key: key('b'),
    style: 'normal',
    children: [{ _type: 'span', _key: key('s'), text, marks }],
    markDefs: markDefs as never,
  } as NonRecursiveBlock
}

function fnRef(targetKey: string, index = 1) {
  const markKey = key('mk')
  return {
    markKey,
    def: { _type: 'footnoteRef', _key: markKey, targetKey, index },
    block: textBlock(String(index), [markKey], [{ _type: 'footnoteRef', _key: markKey, targetKey, index }]),
  }
}

function fnDef(defKey: string, index: number, children: NonRecursiveBlock[] = []): FootnoteDefinitionBlock {
  return { _type: 'footnoteDefinition', _key: defKey, index, children }
}

function tableCell(text: string, markDefs?: unknown[]): TableCell {
  return {
    _type: 'tableCell',
    _key: key('c'),
    content: [{ _type: 'span', _key: key('s'), text }],
    markDefs: markDefs as never,
  }
}

function tableRow(cells: TableCell[]): TableRow {
  return { _type: 'tableRow', _key: key('r'), cells }
}

// --- synchronizeFootnoteIndices ------------------------------------------

describe('shared/pt/footnote-sync — synchronizeFootnoteIndices', () => {
  it('returns the body unchanged when there are no footnote definitions', () => {
    const body = [textBlock('no defs here')] as PortableTextBody
    expect(synchronizeFootnoteIndices(body)).toBe(body)
  })

  it('returns the body unchanged when a ref targets a missing definition', () => {
    const { block } = fnRef('missing-key', 5)
    const body = [block, fnDef('other', 1)] as PortableTextBody
    expect(synchronizeFootnoteIndices(body)).toBe(body)
  })

  it('returns the body unchanged when there are defs but no refs and no orphan defs are cited', () => {
    // defs exist; collectFootnoteCitationOrder returns [] only when there
    // are no refs AND no orphan def keys. Here the def itself IS in order,
    // so this exercises the non-empty order path instead.
    const def = fnDef('d1', 99, [textBlock('body')])
    const body = [def] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    // Orphan def gets renumbered to 1.
    expect(result.filter((b) => b._type === 'footnoteDefinition')).toHaveLength(1)
    const out = result.find((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock
    expect(out.index).toBe(1)
  })

  it('renumbers refs and definitions in first-citation order (main column)', () => {
    const r2 = fnRef('d2', 9)
    const r1 = fnRef('d1', 9)
    const body = [
      r1.block,
      r2.block,
      fnDef('d1', 7, [textBlock('one')]),
      fnDef('d2', 8, [textBlock('two')]),
    ] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const defs = result.filter((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock[]
    expect(defs.map((d) => d.index)).toEqual([1, 2])
    // Span digit on the ref should be updated to the new index.
    const refBlock = result.find((b) => b._type === 'block') as unknown as { children: { text: string }[] }
    expect(refBlock.children[0]!.text).toBe('1')
  })

  it('walks refs inside solution children', () => {
    const ref = fnRef('sd', 3)
    const body = [
      { _type: 'solution', _key: 'sol', children: [ref.block] },
      fnDef('sd', 9, [textBlock('sol footnote')]),
    ] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const def = result.find((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock
    expect(def.index).toBe(1)
  })

  it('walks refs inside twoColumn left and right columns', () => {
    const l = fnRef('ld', 4)
    const r = fnRef('rd', 5)
    const body = [
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [l.block],
        right: [r.block],
      },
      fnDef('ld', 8, [textBlock('left')]),
      fnDef('rd', 7, [textBlock('right')]),
    ] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const defs = result.filter((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock[]
    expect(defs.map((d) => d.index)).toEqual([1, 2])
  })

  it('walks refs inside table cells', () => {
    const ref = fnRef('td', 6)
    const cell = tableCell('cell', [ref.def])
    cell.content = [{ _type: 'span', _key: key('s'), text: '6', marks: [ref.markKey] }]
    const tableBlock = {
      _type: 'table',
      _key: key('t'),
      rows: [tableRow([cell])],
    } as unknown as NonRecursiveBlock
    const body = [tableBlock, fnDef('td', 9, [textBlock('table fn')])] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const def = result.find((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock
    expect(def.index).toBe(1)
    // Table cell text digit should be renumbered.
    const outTable = result.find((b) => b._type === 'table') as unknown as {
      rows: { cells: { content: { text: string }[] }[] }[]
    }
    expect(outTable.rows[0]!.cells[0]!.content[0]!.text).toBe('1')
  })

  it('keeps the second occurrence of a citation at the same index (dedup)', () => {
    const first = fnRef('dd', 1)
    const second = fnRef('dd', 1)
    const body = [first.block, second.block, fnDef('dd', 9, [textBlock('once')])] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const def = result.find((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock
    expect(def.index).toBe(1)
  })

  it('appends orphan definitions after cited ones, sorted by index', () => {
    const ref = fnRef('cited', 1)
    const body = [
      ref.block,
      fnDef('orphan2', 2, [textBlock('o2')]),
      fnDef('orphan1', 1, [textBlock('o1')]),
      fnDef('cited', 9, [textBlock('c')]),
    ] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const defs = result.filter((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock[]
    // Cited first (index 1). Orphans appended in body order (orphan2 then
    // orphan1) then the whole def list sorted ascending by index.
    expect(defs.map((d) => d.index)).toEqual([1, 2, 3])
    // orphan2 is declared first in the body so it gets the lower index.
    expect(defs.map((d) => d._key)).toEqual(['cited', 'orphan2', 'orphan1'])
  })

  it('preserves a ref whose target has no index mapping (def present but unreachable)', () => {
    // When a ref points at a defined key, it's always mapped; this guards
    // the syncMarkDefs branch where m.index === idx (no change needed).
    const ref = fnRef('keep', 1)
    const body = [ref.block, fnDef('keep', 1, [textBlock('x')])] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const def = result.find((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock
    expect(def.index).toBe(1)
  })

  it('skips renumbering when a ref index already equals the new index', () => {
    const ref = fnRef('eq', 1)
    const body = [ref.block, fnDef('eq', 1, [textBlock('y')])] as PortableTextBody
    const before = JSON.stringify(body)
    const result = synchronizeFootnoteIndices(body)
    // No change to the structure (values already canonical).
    expect(JSON.stringify(result)).toBe(before)
  })

  it('renumbers footnoteRef marks nested inside a definition’s own children', () => {
    // A definition citing another definition: the inner ref sits one
    // container level down, so only the mapping descent reaches it.
    const inner = fnRef('target', 7)
    const body = [fnDef('target', 9, [textBlock('real note')]), fnDef('carrier', 8, [inner.block])] as PortableTextBody
    const result = synchronizeFootnoteIndices(body)
    const defs = result.filter((b) => b._type === 'footnoteDefinition') as FootnoteDefinitionBlock[]
    // 'target' is cited (from inside 'carrier'), so it renumbers to 1;
    // 'carrier' is an orphan appended after it.
    expect(defs.map((d) => [d._key, d.index])).toEqual([
      ['target', 1],
      ['carrier', 2],
    ])
    // The nested ref mark's index was rewritten to the new citation index.
    const carrier = defs.find((d) => d._key === 'carrier')!
    const carrierBlock = carrier.children[0] as Extract<NonRecursiveBlock, { _type: 'block' }>
    const refDef = carrierBlock.markDefs![0] as { _type: string; index: number }
    expect(refDef).toMatchObject({ _type: 'footnoteRef', index: 1 })
  })
})

// --- footnoteSyncSignature -----------------------------------------------

describe('shared/pt/footnote-sync — footnoteSyncSignature', () => {
  it('encodes inline occurrences and sorted definitions into a stable string', () => {
    const r1 = fnRef('a', 1)
    const r2 = fnRef('b', 2)
    const body = [
      r1.block,
      r2.block,
      fnDef('b', 2, [textBlock('two')]),
      fnDef('a', 1, [textBlock('one')]),
    ] as PortableTextBody
    const sig = footnoteSyncSignature(body)
    // Two occurrences, in walk order; defs sorted lexically (a@1, b@2).
    const [occPart, defPart] = sig.split('\u001e')
    expect(occPart).toBe('a:1\u001fb:2')
    expect(defPart).toBe('a@1\u001fb@2')
  })

  it('emits empty occurrence list when only definitions exist', () => {
    const body = [fnDef('solo', 1, [textBlock('x')])] as PortableTextBody
    const sig = footnoteSyncSignature(body)
    const [occPart, defPart] = sig.split('\u001e')
    expect(occPart).toBe('')
    expect(defPart).toBe('solo@1')
  })
})
