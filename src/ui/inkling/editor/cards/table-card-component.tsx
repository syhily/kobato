import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback } from 'react'

import type { InklingTableNode } from '@/shared/inkling/schema'
import type { TableCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { KoenigCardWrapper } from '@/ui/inkling/components/KoenigCardWrapper'
import { ActionToolbar } from '@/ui/inkling/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling/components/ui/ToolbarMenu'
import { useCardContext } from '@/ui/inkling/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling/editor/commands'
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
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useCardContext()

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
    <KoenigCardWrapper nodeKey={node.getKey()}>
      <ActionToolbar isVisible={isSelected && !isEditing}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" label="编辑" onClick={() => setEditing(true)} />
          <ToolbarMenuItem
            icon="remove"
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, undefined)}
          />
        </ToolbarMenu>
      </ActionToolbar>

      <div className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.key ?? rowIndex}>
                  {row.cells.map((cell, cellIndex) => {
                    const CellTag = cell.isHeader === true ? 'th' : 'td'
                    return (
                      <CellTag
                        key={cell.key ?? cellIndex}
                        className="border border-grey-300 px-2 py-1 text-sm dark:border-grey-700"
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={cell.children.map((c) => (c.type === 'text' ? c.text : '')).join('')}
                            onChange={(e) => {
                              const nonTextChildren = cell.children.filter((c) => c.type !== 'text')
                              const newTextNode = { type: 'text' as const, version: 1 as const, text: e.target.value }
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
        {isEditing ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addRow}
              className="rounded border border-grey-300 px-3 py-1 text-xs hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              ＋行
            </button>
            <button
              type="button"
              onClick={() => deleteRow(rows.length - 1)}
              className="rounded border border-grey-300 px-3 py-1 text-xs hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              −行
            </button>
            <button
              type="button"
              onClick={addCol}
              className="rounded border border-grey-300 px-3 py-1 text-xs hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              ＋列
            </button>
            <button
              type="button"
              onClick={() => deleteCol(cellCount - 1)}
              className="rounded border border-grey-300 px-3 py-1 text-xs hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              −列
            </button>
            <button
              type="button"
              aria-pressed={hasHeaderRow}
              onClick={toggleHeaderRow}
              className={cn(
                'rounded border px-3 py-1 text-xs',
                hasHeaderRow
                  ? 'border-green bg-green text-white'
                  : 'border-grey-300 hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800',
              )}
            >
              {hasHeaderRow ? '取消表头' : '设为表头'}
            </button>
          </div>
        ) : null}
      </div>
    </KoenigCardWrapper>
  )
}
