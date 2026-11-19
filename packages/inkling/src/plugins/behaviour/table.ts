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

export interface InsertTableDataset {
  rows?: number
  columns?: number
  includeHeaderRow?: boolean
}

export const INSERT_TABLE_COMMAND = createCommand<InsertTableDataset>('INSERT_TABLE_COMMAND')

const DEFAULT_TABLE_ROWS = 3
const DEFAULT_TABLE_COLUMNS = 3

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function $insertTable(dataset: unknown): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  const payload: Record<string, unknown> = isUnknownRecord(dataset) ? dataset : {}
  const rows = isPositiveInteger(payload.rows) ? payload.rows : DEFAULT_TABLE_ROWS
  const columns = isPositiveInteger(payload.columns) ? payload.columns : DEFAULT_TABLE_COLUMNS
  const includeHeaderRow = typeof payload.includeHeaderRow === 'boolean' ? payload.includeHeaderRow : true
  const tableNode = $createTableNodeWithDimensions(rows, columns, { rows: includeHeaderRow, columns: false })
  const topLevel = selection.focus.getNode().getTopLevelElement()
  $insertNodeToNearestRoot(tableNode)

  if ($isParagraphNode(topLevel) && topLevel.getTextContent() === '' && topLevel.isAttached()) {
    topLevel.remove()
  }

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

export function registerTableBehaviour(editor: LexicalEditor): () => void {
  return mergeRegister(registerTableInsert(editor), registerTableSelectionObserver(editor, true))
}
