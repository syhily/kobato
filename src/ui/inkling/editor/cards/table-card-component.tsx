import type { ReactNode } from 'react'

import { useCallback } from 'react'

import type { InklingTableNode } from '@/shared/inkling/schema'
import type { TableCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { CardShell } from '@/ui/inkling/editor/cards/card-shell'
import { useCardNode } from '@/ui/inkling/editor/cards/use-card-node'
import { cn } from '@/ui/lib/cn'

function emptyRow(cellCount: number): {
  type: 'tablerow'
  version: number
  cells: Array<{ type: 'tablecell'; version: number; isHeader?: boolean; children: [] }>
} {
  return {
    type: 'tablerow',
    version: 1,
    cells: Array.from({ length: cellCount }, () => ({ type: 'tablecell', version: 1, isHeader: false, children: [] })),
  }
}

export function TableCardComponent({ node }: { node: TableCardNode }): ReactNode {
  const { editor, isSelected } = useCardNode(node)

  const update = useCallback(
    (patch: Partial<InklingTableNode>): void => {
      editor.update(() => {
        if (patch.rows !== undefined) {
          node.setRows(patch.rows)
        }
      })
    },
    [editor, node],
  )

  const rows = node.getRows()
  const cellCount = rows[0]?.cells.length ?? 2

  const addRow = () => update({ rows: [...rows, emptyRow(cellCount)] })
  const addCol = () =>
    update({
      rows: rows.map((row) => ({ ...row, cells: [...row.cells, { type: 'tablecell', version: 1, children: [] }] })),
    })
  const deleteRow = (idx: number) => {
    if (rows.length <= 1) {
      return
    }
    update({ rows: rows.filter((_, i) => i !== idx) })
  }
  const deleteCol = (idx: number) => {
    if (cellCount <= 1) {
      return
    }
    update({ rows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i !== idx) })) })
  }
  const hasHeaderRow = rows[0]?.cells.some((cell) => cell.isHeader === true) ?? false
  const toggleHeaderRow = () => {
    update({
      rows: rows.map((row, index) =>
        index === 0 ? { ...row, cells: row.cells.map((cell) => ({ ...cell, isHeader: !hasHeaderRow })) } : row,
      ),
    })
  }

  return (
    <CardShell nodeKey={node.getKey()} className="p-3">
      <div className="pt-table-wrapper overflow-x-auto">
        <table className="pt-table w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key ?? rowIndex}>
                {row.cells.map((cell, cellIndex) => {
                  const CellTag = cell.isHeader === true ? 'th' : 'td'
                  return (
                    <CellTag
                      key={cell.key ?? cellIndex}
                      className="border border-muted-foreground/30 px-2 py-1 text-sm"
                    >
                      {isSelected ? (
                        <input
                          type="text"
                          value={cell.children.map((c) => (c.type === 'text' ? c.text : '')).join('')}
                          onChange={(e) => {
                            const nonTextChildren = cell.children.filter((c) => c.type !== 'text')
                            const newTextNode = {
                              type: 'text' as const,
                              version: 1 as const,
                              text: e.target.value,
                            }
                            const newRows: InklingTableNode['rows'] = rows.map((r, ri) =>
                              ri === rowIndex
                                ? {
                                    ...r,
                                    cells: r.cells.map((c, ci) =>
                                      ci === cellIndex ? { ...c, children: [newTextNode, ...nonTextChildren] } : c,
                                    ),
                                  }
                                : r,
                            )
                            update({ rows: newRows })
                          }}
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      ) : (
                        cell.children
                          .map((child) => {
                            if (child.type === 'text') {
                              return child.text
                            }
                            if (child.type === 'link') {
                              return `[链接: ${child.url}]`
                            }
                            if (child.type === 'inline-math') {
                              return `$${child.tex}$`
                            }
                            return ''
                          })
                          .join('') || '\u00A0'
                      )}
                    </CellTag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isSelected ? (
        <div className="inkling-card-controlbar">
          <button type="button" onClick={addRow} className="inkling-card-button">
            ＋行
          </button>
          <button
            type="button"
            onClick={() => {
              if (rows.length > 1) {
                deleteRow(rows.length - 1)
              }
            }}
            className="inkling-card-button"
          >
            −行
          </button>
          <button type="button" onClick={addCol} className="inkling-card-button">
            ＋列
          </button>
          <button
            type="button"
            onClick={() => {
              if (cellCount > 1) {
                deleteCol(cellCount - 1)
              }
            }}
            className="inkling-card-button"
          >
            −列
          </button>
          <button
            type="button"
            aria-pressed={hasHeaderRow}
            onClick={toggleHeaderRow}
            className={cn('inkling-card-button', hasHeaderRow && 'inkling-card-button--primary')}
          >
            {hasHeaderRow ? '取消表头' : '设为表头'}
          </button>
        </div>
      ) : null}
    </CardShell>
  )
}
