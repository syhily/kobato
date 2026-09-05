import type { LexicalEditor } from 'lexical'

import { $createTableNodeWithDimensions, registerTableSelectionObserver } from '@lexical/table'
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from 'lexical'

/**
 * The slash-menu table entry's command, created here in the behaviour layer
 * (the EDIT_MATH_INLINE_COMMAND precedent) rather than reusing upstream's
 * registerTablePlugin: the payload is numeric rows/columns with a
 * header-row-only default — a header row maps to first-row header cells
 * only, never a header column.
 */
export interface InsertTableDataset {
  rows?: number
  columns?: number
  includeHeaderRow?: boolean
}

export const INSERT_TABLE_COMMAND = createCommand<InsertTableDataset>('INSERT_TABLE_COMMAND')

const DEFAULT_TABLE_ROWS = 3
const DEFAULT_TABLE_COLUMNS = 3

// Command payloads cross the type-erased menu dispatch, so narrow before
// constructing the table; any field that isn't a positive integer falls
// back to the 3×3 default.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/**
 * Inserts an N×M empty table at the current selection, header row on unless
 * told otherwise. A $-function: it must run inside editor.update() — the
 * INSERT_TABLE_COMMAND handler already runs in the dispatch update. Returns
 * false, leaving the editor untouched, when there is no range selection to
 * insert at.
 */
export function $insertTable(dataset: unknown): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  const payload: Record<string, unknown> =
    typeof dataset === 'object' && dataset !== null ? (dataset as Record<string, unknown>) : {}
  const rows = isPositiveInteger(payload.rows) ? payload.rows : DEFAULT_TABLE_ROWS
  const columns = isPositiveInteger(payload.columns) ? payload.columns : DEFAULT_TABLE_COLUMNS
  const includeHeaderRow = typeof payload.includeHeaderRow === 'boolean' ? payload.includeHeaderRow : true

  const tableNode = $createTableNodeWithDimensions(rows, columns, { rows: includeHeaderRow, columns: false })
  const topLevel = selection.focus.getNode().getTopLevelElement()
  $insertNodeToNearestRoot(tableNode)

  // card-insert parity: an empty trigger paragraph doesn't survive the insert
  if ($isParagraphNode(topLevel) && topLevel.getTextContent() === '' && topLevel.isAttached()) {
    topLevel.remove()
  }

  // Land the caret in the first cell. getFirstDescendant() bottoms out at the
  // cell's (empty) paragraph — never a text node — so select the element.
  const firstDescendant = tableNode.getFirstDescendant()
  if ($isTextNode(firstDescendant)) {
    firstDescendant.select()
  } else if ($isElementNode(firstDescendant)) {
    firstDescendant.selectStart()
  }

  return true
}

export function registerTableInsert(editor: LexicalEditor): () => void {
  return editor.registerCommand(INSERT_TABLE_COMMAND, (dataset) => $insertTable(dataset), COMMAND_PRIORITY_LOW)
}

/**
 * The live-editor table behaviour: the insert handler plus upstream's
 * selection observer (cell-range selection, Tab navigation between cells).
 * The cell guard that keeps cell content inline-only is registered as a
 * default transform instead (`@/transforms`), so it also covers the
 * headless import path.
 */
export function registerTableBehaviour(editor: LexicalEditor): () => void {
  return mergeRegister(registerTableInsert(editor), registerTableSelectionObserver(editor, true))
}
