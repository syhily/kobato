import { type ReactNode } from 'react'

import type { InklingTableCellNode, InklingTableNode } from '@/shared/inkling/schema'

export function TableBlock({ node }: { node: InklingTableNode }): ReactNode {
  const rows = node.rows
  const hasHeader = rows.length > 0 && rows[0]!.cells.some((cell) => cell.isHeader === true)
  const headRows = hasHeader ? rows.slice(0, 1) : []
  const bodyRows = hasHeader ? rows.slice(1) : rows
  return (
    <div className="pt-table-wrapper overflow-x-auto">
      <table className="pt-table">
        {headRows.length > 0 ? (
          <thead>
            {headRows.map((row) => (
              <tr key={row.key ?? row.cells.map((c) => c.key).join('-')}>
                {row.cells.map((cell) => (
                  <th key={cell.key}>{renderCellInline(cell)}</th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row) => (
            <tr key={row.key ?? row.cells.map((c) => c.key).join('-')}>
              {row.cells.map((cell) => {
                const Tag = cell.isHeader === true ? 'th' : 'td'
                return <Tag key={cell.key}>{renderCellInline(cell)}</Tag>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderCellInline(_cell: InklingTableCellNode): ReactNode {
  // Inline content is rendered by the walker; this placeholder is replaced
  // by the caller which wraps the walker output.
  return null
}
