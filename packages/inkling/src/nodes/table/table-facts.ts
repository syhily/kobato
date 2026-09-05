import { $isTableCellNode, type TableCellNode, type TableRowNode } from '@/nodes/table/TableNodes'

// Table header facts — the one owner of the table family's "header row
// only, never a header column" invariant as export policy (the insert
// command owns the construction default: 3×3 with header row). The two
// export directions diverge BY DECLARATION here instead of by coincidence:
//
// - HTML export reads the cells' header state (a header cell is a <th>) —
//   a headerless table stays headerless.
// - GFM markdown export FORGES row 0 as the header — GFM has no headerless
//   tables, so a headerless table gains a header through markdown.

/** The HTML tag for a table cell: a header cell is a <th>, anything else a <td>. */
export function getTableCellTag(cell: TableCellNode): 'th' | 'td' {
  return cell.hasHeader() ? 'th' : 'td'
}

/**
 * The GFM pipe-table lines for a table's rows: row 0, then the `---`
 * divider, then the body rows. Row 0 is ALWAYS the header (the declared
 * GFM policy above) — the divider is placed after it regardless of the
 * cells' header state.
 */
export function resolveGfmPipeTableLines(rows: TableRowNode[], cellText: (cell: TableCellNode) => string): string[] {
  // a rowless table has no pipe-table shape — Math.max over zero rows would
  // be -Infinity and lines[0] undefined
  if (rows.length === 0) {
    return []
  }

  const lines = rows.map((row) => {
    const cells = row
      .getChildren()
      .filter($isTableCellNode)
      .map((cell) => cellText(cell))
    return '| ' + cells.join(' | ') + ' |'
  })

  const columnCount = Math.max(...rows.map((row) => row.getChildrenSize()))
  const divider = '| ' + Array.from({ length: columnCount }, () => '---').join(' | ') + ' |'
  return [lines[0], divider, ...lines.slice(1)]
}
