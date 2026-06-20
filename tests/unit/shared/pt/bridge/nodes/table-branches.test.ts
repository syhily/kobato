import { describe, expect, it } from 'vitest'

import type { PmBlockNode } from '@/shared/pt/bridge/types'
import type { TableBlock, TableCell, TableRow } from '@/shared/pt/schema'

import { pmCellToTableCell, pmTableToBlock, tableBlockToPmNode } from '@/shared/pt/bridge/nodes/table'

// --- helpers --------------------------------------------------------------

let n = 0
function key(p: string): string {
  n += 1
  return `${p}${n}`
}

function span(text: string, marks?: string[]) {
  return { _type: 'span' as const, _key: key('s'), text, marks }
}

function cell(text: string, overrides: Partial<TableCell> = {}): TableCell {
  return {
    _type: 'tableCell',
    _key: key('c'),
    content: [span(text)],
    ...overrides,
  }
}

function row(cells: TableCell[]): TableRow {
  return { _type: 'tableRow', _key: key('r'), cells }
}

function table(rows: TableRow[], overrides: Partial<TableBlock> = {}): TableBlock {
  return { _type: 'table', _key: key('t'), rows, ...overrides }
}

// ensureKey callback that simply echoes the existing _key (or generates one)
function ensureKeyEcho(attrs: Record<string, unknown> | undefined): string {
  if (attrs && typeof attrs._key === 'string') {
    return attrs._key
  }
  return key('g')
}

// --- tableBlockToPmNode ---------------------------------------------------

describe('shared/pt/bridge/nodes/table — tableBlockToPmNode', () => {
  it('marks the first row as headers when hasHeaderRow is true', () => {
    const blk = table([row([cell('H')]), row([cell('body')])], { hasHeaderRow: true })
    const node = tableBlockToPmNode(blk) as PmBlockNode
    expect(node.type).toBe('table')
    expect(node.attrs).toEqual({ _key: blk._key, hasHeaderRow: true })
    const rows = node.content ?? []
    expect(rows[0]!.type).toBe('tableRow')
    const headerCell = (rows[0] as PmBlockNode).content![0] as PmBlockNode
    expect(headerCell.type).toBe('tableHeader')
    const bodyCell = (rows[1] as PmBlockNode).content![0] as PmBlockNode
    expect(bodyCell.type).toBe('tableCell')
  })

  it('defaults hasHeaderRow to false when omitted', () => {
    const blk = table([row([cell('a')])])
    const node = tableBlockToPmNode(blk) as PmBlockNode
    expect(node.attrs).toEqual({ _key: blk._key, hasHeaderRow: false })
  })

  it('honors an explicit isHeader=true on a cell even without hasHeaderRow', () => {
    const blk = table([row([cell('x', { isHeader: true })])])
    const node = tableBlockToPmNode(blk) as PmBlockNode
    const c = (node.content![0] as PmBlockNode).content![0] as PmBlockNode
    expect(c.type).toBe('tableHeader')
  })

  it('pushes span text via pushSpan and wraps each cell in a paragraph', () => {
    const blk = table([row([cell('hi')])])
    const node = tableBlockToPmNode(blk) as PmBlockNode
    const cellNode = (node.content![0] as PmBlockNode).content![0] as PmBlockNode
    const para = cellNode.content![0] as PmBlockNode
    expect(para.type).toBe('paragraph')
    expect(para.content).toEqual([{ type: 'text', text: 'hi' }])
  })
})

// --- pmTableToBlock -------------------------------------------------------

describe('shared/pt/bridge/nodes/table — pmTableToBlock', () => {
  function pmTable(rows: PmBlockNode[], opts?: { hasHeaderRow?: boolean }): PmBlockNode {
    return {
      type: 'table',
      attrs: { _key: 't1', ...(opts?.hasHeaderRow !== undefined ? { hasHeaderRow: opts.hasHeaderRow } : {}) },
      content: rows,
    }
  }

  function pmRow(cells: PmBlockNode[], attrs: Record<string, unknown> = {}): PmBlockNode {
    return { type: 'tableRow', attrs: { _key: 'r1', ...attrs }, content: cells }
  }

  function pmCell(text: string, type: 'tableCell' | 'tableHeader' = 'tableCell'): PmBlockNode {
    return {
      type,
      attrs: { _key: 'c1' },
      content: [{ type: 'paragraph', attrs: { _key: 'p1' }, content: [{ type: 'text', text }] }],
    }
  }

  it('infers hasHeaderRow=true when the first row is entirely tableHeader cells', () => {
    const node = pmTable([pmRow([pmCell('H', 'tableHeader')]), pmRow([pmCell('body')])])
    const blk = pmTableToBlock(node, ensureKeyEcho)
    expect(blk.hasHeaderRow).toBe(true)
    expect(blk.rows[0]!.cells[0]!.isHeader).toBe(true)
    expect(blk.rows[1]!.cells[0]!.isHeader).not.toBe(true)
  })

  it('infers hasHeaderRow=false when the first row has mixed cell types', () => {
    const node = pmTable([pmRow([pmCell('a', 'tableHeader'), pmCell('b')])])
    const blk = pmTableToBlock(node, ensureKeyEcho)
    // When hasHeaderRow resolves to false, the property is omitted entirely.
    expect(blk.hasHeaderRow).toBeUndefined()
  })

  it('infers hasHeaderRow=false when the first row has no cells', () => {
    const node = pmTable([pmRow([])])
    const blk = pmTableToBlock(node, ensureKeyEcho)
    expect(blk.hasHeaderRow).toBeUndefined()
  })

  it('honors an explicit hasHeaderRow=false attribute over the inferred value', () => {
    const node = pmTable([pmRow([pmCell('H', 'tableHeader')])], { hasHeaderRow: false })
    const blk = pmTableToBlock(node, ensureKeyEcho)
    // Explicit false still resolves to omitted (the property is only ever
    // emitted when the value is true).
    expect(blk.hasHeaderRow).toBeUndefined()
    // The original cell retains its isHeader marker from its node type —
    // the post-process only rewrites row 0 when hasHeaderRow is true.
    expect(blk.rows[0]!.cells[0]!.isHeader).toBe(true)
  })

  it('honors an explicit hasHeaderRow=true and rewrites row 0 cells to isHeader', () => {
    const node = pmTable([pmRow([pmCell('a')]), pmRow([pmCell('b')])], { hasHeaderRow: true })
    const blk = pmTableToBlock(node, ensureKeyEcho)
    expect(blk.hasHeaderRow).toBe(true)
    expect(blk.rows[0]!.cells[0]!.isHeader).toBe(true)
    expect(blk.rows[1]!.cells[0]!.isHeader).not.toBe(true)
  })

  it('returns empty rows array and no hasHeaderRow when given no rows', () => {
    const node = pmTable([])
    const blk = pmTableToBlock(node, ensureKeyEcho)
    expect(blk.rows).toEqual([])
    expect(blk.hasHeaderRow).toBeUndefined()
  })

  it('skips non-tableRow content when filtering rows', () => {
    const node = pmTable([pmRow([pmCell('keep')]), { type: 'paragraph', attrs: { _key: 'p1' }, content: [] }])
    const blk = pmTableToBlock(node, ensureKeyEcho)
    expect(blk.rows).toHaveLength(1)
    expect(blk.rows[0]!.cells[0]!.content[0]!.text).toBe('keep')
  })
})

// --- pmCellToTableCell ----------------------------------------------------

describe('shared/pt/bridge/nodes/table — pmCellToTableCell', () => {
  function pmCellWith(content: PmBlockNode[], type: 'tableCell' | 'tableHeader' = 'tableCell'): PmBlockNode {
    return { type, attrs: { _key: 'cc' }, content }
  }

  it('returns an empty cell when the node has no paragraph content', () => {
    const node = pmCellWith([], 'tableCell')
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.content).toEqual([])
    expect(c.markDefs).toBeUndefined()
    expect(c.isHeader).toBeUndefined()
  })

  it('marks the cell as header when the node type is tableHeader', () => {
    const node = pmCellWith(
      [{ type: 'paragraph', attrs: { _key: 'p' }, content: [{ type: 'text', text: 'H' }] }],
      'tableHeader',
    )
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.isHeader).toBe(true)
  })

  it('uses only the first paragraph and ignores subsequent paragraphs', () => {
    const node = pmCellWith([
      { type: 'paragraph', attrs: { _key: 'p1' }, content: [{ type: 'text', text: 'first' }] },
      { type: 'paragraph', attrs: { _key: 'p2' }, content: [{ type: 'text', text: 'second' }] },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.content).toHaveLength(1)
    expect(c.content[0]!.text).toBe('first')
  })

  it('drops inline marks that pmMarkToSpanMark cannot convert (returns null)', () => {
    const node = pmCellWith([
      {
        type: 'paragraph',
        attrs: { _key: 'p1' },
        content: [{ type: 'text', text: 'x', marks: [{ type: 'unsupportedMark', attrs: {} }] }],
      },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.content[0]!.marks).toBeUndefined()
  })

  it('applies decorator marks (bold/italic/etc.) and emits no markDefs', () => {
    const node = pmCellWith([
      {
        type: 'paragraph',
        attrs: { _key: 'p1' },
        content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold', attrs: {} }] }],
      },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.content[0]!.marks).toEqual(['strong'])
    expect(c.markDefs).toBeUndefined()
  })

  it('drops non-link defs (mathInline / footnoteRef) from cell markDefs', () => {
    const node = pmCellWith([
      {
        type: 'paragraph',
        attrs: { _key: 'p1' },
        content: [
          {
            type: 'text',
            text: 'math',
            marks: [{ type: 'mathInline', attrs: { _key: 'mi1', tex: 'x^2' } }],
          },
        ],
      },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    // mathInline def is filtered out by the `conv.def._type !== 'link'` guard,
    // so marks ends up empty and the marks field is omitted entirely.
    expect(c.content[0]!.marks).toBeUndefined()
    expect(c.markDefs).toBeUndefined()
  })

  it('converts link marks into a markDef entry and references it by _key', () => {
    const node = pmCellWith([
      {
        type: 'paragraph',
        attrs: { _key: 'p1' },
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { _key: 'lk1', href: 'https://x' } }],
          },
        ],
      },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.content[0]!.marks).toEqual(['lk1'])
    expect(c.markDefs).toEqual([{ _type: 'link', _key: 'lk1', href: 'https://x' }])
  })

  it('deduplicates link markDefs when the same key is referenced twice', () => {
    const node = pmCellWith([
      {
        type: 'paragraph',
        attrs: { _key: 'p1' },
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { _key: 'lk1', href: '/x' } }] },
          { type: 'text', text: 'b', marks: [{ type: 'link', attrs: { _key: 'lk1', href: '/x' } }] },
        ],
      },
    ])
    const c = pmCellToTableCell(node, ensureKeyEcho)
    expect(c.markDefs).toHaveLength(1)
  })
})
