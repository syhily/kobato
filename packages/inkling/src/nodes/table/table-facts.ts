import {
  $isTableCellNode,
  type TableCellNode,
  type TableRowNode,
} from '@kobato/inkling-internal/nodes/table/TableNodes'

export function getTableCellTag(cell: TableCellNode): 'th' | 'td' {
  return cell.hasHeader() ? 'th' : 'td'
}

export function resolveGfmPipeTableLines(rows: TableRowNode[], cellText: (cell: TableCellNode) => string): string[] {
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
