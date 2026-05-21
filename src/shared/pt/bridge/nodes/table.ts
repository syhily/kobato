import type { PmBlockNode, PmMark } from '@/shared/pt/bridge/types'
import type { LinkMarkDef, TableBlock, TableCell, TableRow, Span } from '@/shared/pt/schema'

import { pmMarkToSpanMark, pushSpan } from '@/shared/pt/bridge/nodes/text'
import { isBlock, isInline } from '@/shared/pt/bridge/utils'

export function tableBlockToPmNode(block: TableBlock): PmBlockNode {
  const hasHeaderRow = block.hasHeaderRow ?? false
  return {
    type: 'table',
    attrs: { _key: block._key, hasHeaderRow },
    content: block.rows.map((row, rowIndex) => ({
      type: 'tableRow',
      attrs: { _key: row._key },
      content: row.cells.map((cell) => {
        const inlines: { type: 'text'; text: string; marks?: PmMark[] }[] = []
        for (const span of cell.content) {
          pushSpan(inlines, span, cell.markDefs ?? [])
        }
        const isHeader = cell.isHeader === true || (hasHeaderRow && rowIndex === 0)
        return {
          type: isHeader ? 'tableHeader' : 'tableCell',
          attrs: { _key: cell._key },
          content: [{ type: 'paragraph', content: inlines }],
        }
      }),
    })),
  }
}

export function pmTableToBlock(
  node: PmBlockNode,
  ensureKey: (attrs: Record<string, unknown> | undefined) => string,
): TableBlock {
  const rowNodes = (node.content ?? []).filter(isBlock).filter((c) => c.type === 'tableRow')
  const rows: TableRow[] = []
  let firstRowAllHeader = true
  let nonEmptyRows = false
  rowNodes.forEach((rowNode, rowIndex) => {
    nonEmptyRows = true
    const cellNodes = (rowNode.content ?? [])
      .filter(isBlock)
      .filter((c) => c.type === 'tableHeader' || c.type === 'tableCell')
    const cells: TableCell[] = cellNodes.map((cellNode) => pmCellToTableCell(cellNode, ensureKey))
    if (rowIndex === 0) {
      firstRowAllHeader = cells.length > 0 && cells.every((cell) => cell.isHeader === true)
    }
    rows.push({ _type: 'tableRow', _key: ensureKey(rowNode.attrs), cells })
  })
  const explicit = node.attrs?.hasHeaderRow
  const hasHeaderRow = typeof explicit === 'boolean' ? explicit : nonEmptyRows && firstRowAllHeader
  if (rows.length > 0) {
    if (hasHeaderRow) {
      rows[0].cells = rows[0].cells.map((cell) => ({ ...cell, isHeader: true }))
    }
  }
  return {
    _type: 'table',
    _key: ensureKey(node.attrs),
    rows,
    ...(hasHeaderRow ? { hasHeaderRow: true } : {}),
  }
}

export function pmCellToTableCell(
  node: PmBlockNode,
  ensureKey: (attrs: Record<string, unknown> | undefined) => string,
): TableCell {
  const isHeader = node.type === 'tableHeader'
  const firstParagraph = (node.content ?? []).filter(isBlock).find((c) => c.type === 'paragraph')
  const content: Span[] = []
  const markDefs: LinkMarkDef[] = []
  let nextSpanKey = 0
  if (firstParagraph !== undefined) {
    const inlines = (firstParagraph.content ?? []).filter(isInline)
    for (const inline of inlines) {
      nextSpanKey += 1
      const spanKey = `s-${nextSpanKey.toString(36)}`
      const marks: string[] = []
      for (const mark of inline.marks ?? []) {
        const conv = pmMarkToSpanMark(mark)
        if (conv === null) {
          continue
        }
        if ('decorator' in conv) {
          marks.push(conv.decorator)
          continue
        }
        if (conv.def._type !== 'link') {
          continue
        }
        marks.push(conv.def._key)
        if (!markDefs.some((existing) => existing._key === conv.def._key)) {
          markDefs.push(conv.def)
        }
      }
      content.push({
        _type: 'span',
        _key: spanKey,
        text: inline.text,
        marks: marks.length > 0 ? marks : undefined,
      })
    }
  }
  return {
    _type: 'tableCell',
    _key: ensureKey(node.attrs),
    content,
    ...(isHeader ? { isHeader: true } : {}),
    ...(markDefs.length > 0 ? { markDefs } : {}),
  }
}
