import type { LexicalEditor } from 'lexical'

import { $createLinkNode, LinkNode } from '@lexical/link'
import { registerRichText } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { tick } from '#/utils/test-editor'
import { FootnoteRefNode, $createFootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { MathInlineNode, $createMathInlineNode } from '@/nodes/math/MathInlineNode'
import {
  $isTableCellNode,
  $isTableNode,
  INKLING_TABLE_NODES,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@/nodes/table/TableNodes'
import { $insertTable, INSERT_TABLE_COMMAND, registerTableBehaviour } from '@/plugins/behaviour/table'
import { registerDefaultTransforms } from '@/transforms/default-transforms'

const NODES = [LinkNode, MathInlineNode, FootnoteRefNode, ...INKLING_TABLE_NODES]

function createTestEditor(): LexicalEditor {
  const editor = createEditor({ nodes: NODES })
  registerRichText(editor)
  registerDefaultTransforms(editor)
  return editor
}

// 0.46 defers the commit of a plain editor.update() to a microtask; discrete
// updates commit synchronously, so assertions can read right after.
function commit(editor: LexicalEditor, mutate: () => void) {
  editor.update(mutate, { discrete: true })
}

// An empty trigger paragraph, then the table through the same path the
// command handler takes — the paragraph is replaced, root holds just the table.
function insertTable(editor: LexicalEditor, payload: Parameters<typeof $insertTable>[0] = {}) {
  commit(editor, () => {
    const paragraph = $createParagraphNode()
    $getRoot().append(paragraph)
    paragraph.select()
    $insertTable(payload)
  })
}

async function dispatch(editor: LexicalEditor, payload: object) {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, payload)
  await tick()
}

function $firstTable(): TableNode {
  const table = $getRoot().getChildren().find($isTableNode)
  if (!table) {
    throw new Error('no table in tree')
  }
  return table
}

function $cell(rowIndex: number, cellIndex: number): TableCellNode {
  const row = $firstTable().getChildren()[rowIndex]
  if (!(row instanceof TableRowNode)) {
    throw new Error(`no row ${rowIndex}`)
  }
  const cell = row.getChildren()[cellIndex]
  if (!(cell instanceof TableCellNode)) {
    throw new Error(`no cell ${rowIndex}/${cellIndex}`)
  }
  return cell
}

type CellChildSummary = { childTypes: string[]; text: string; type: string }

function readCellChildren(editor: LexicalEditor, rowIndex: number, cellIndex: number): CellChildSummary[] {
  return editor.getEditorState().read(() =>
    $cell(rowIndex, cellIndex)
      .getChildren()
      .map((node) => ({
        childTypes: 'getChildren' in node ? (node as TableCellNode).getChildren().map((child) => child.getType()) : [],
        text: node.getTextContent(),
        type: node.getType(),
      })),
  )
}

function readTableSummary(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const table = $firstTable()
    return {
      columnCount: (table.getChildren()[0] as TableRowNode).getChildren().length,
      headerStyles: (table.getChildren() as TableRowNode[]).map((row) =>
        row.getChildren().map((cell) => (cell as TableCellNode).getHeaderStyles()),
      ),
      rootTypes: $getRoot()
        .getChildren()
        .map((node) => node.getType()),
      rowCount: table.getChildren().length,
    }
  })
}

describe('cell guard (registerDefaultTransforms)', () => {
  it('unwraps a direct text child into the cell paragraph', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    commit(editor, () => {
      const cell = $cell(0, 0)
      cell.clear()
      cell.append($createTextNode('hello'))
    })
    expect(readCellChildren(editor, 0, 0)).toEqual([{ childTypes: ['text'], text: 'hello', type: 'paragraph' }])
  })

  it('unwraps a direct link child, keeping the link inline inside the paragraph', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    commit(editor, () => {
      const cell = $cell(0, 0)
      cell.clear()
      cell.append($createLinkNode('https://example.com').append($createTextNode('example')))
    })
    expect(readCellChildren(editor, 0, 0)).toEqual([{ childTypes: ['link'], text: 'example', type: 'paragraph' }])
  })

  it('drops an inline-math child and wraps the surviving text', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    commit(editor, () => {
      const cell = $cell(0, 0)
      cell.clear()
      cell.append($createMathInlineNode({ tex: 'x^2' }), $createTextNode(' after'))
    })
    expect(readCellChildren(editor, 0, 0)).toEqual([{ childTypes: ['text'], text: ' after', type: 'paragraph' }])
  })

  it('drops a footnote-ref child and wraps the surviving text', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    commit(editor, () => {
      const cell = $cell(0, 0)
      cell.clear()
      cell.append($createFootnoteRefNode('1', 'keyA'), $createTextNode(' after'))
    })
    expect(readCellChildren(editor, 0, 0)).toEqual([{ childTypes: ['text'], text: ' after', type: 'paragraph' }])
  })

  it('leaves a well-formed cell structurally untouched', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    const before = editor.getEditorState().read(() => ({
      childKeys: $cell(0, 0)
        .getChildren()
        .map((node) => node.getKey()),
    }))
    commit(editor, () => {
      // Dirty the cell so its transform reruns; the guard must no-op.
      $cell(0, 0).setWidth(120)
    })
    const after = editor.getEditorState().read(() => ({
      childKeys: $cell(0, 0)
        .getChildren()
        .map((node) => node.getKey()),
    }))
    expect(after.childKeys).toEqual(before.childKeys)
    expect(readCellChildren(editor, 0, 0)).toEqual([{ childTypes: [], text: '', type: 'paragraph' }])
  })
})

describe('$insertTable', () => {
  it('creates rows × columns cells with the requested header row', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 3, includeHeaderRow: true, rows: 2 })
    const summary = readTableSummary(editor)
    expect(summary.rowCount).toBe(2)
    expect(summary.columnCount).toBe(3)
    expect(summary.headerStyles).toEqual([
      [TableCellHeaderStates.ROW, TableCellHeaderStates.ROW, TableCellHeaderStates.ROW],
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
    ])
  })

  it('falls back to 3×3 with a header row for malformed datasets', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 'nope', includeHeaderRow: 'yes', rows: Number.NaN })
    const summary = readTableSummary(editor)
    expect(summary.rowCount).toBe(3)
    expect(summary.columnCount).toBe(3)
    expect(summary.headerStyles[0]).toEqual([
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
    ])
  })

  it('replaces the empty trigger paragraph, keeping the trailing paragraph like card inserts', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 1, rows: 1 })
    // $insertAndSelectNode parity: the empty trigger paragraph is gone; the
    // split remainder after the table plays the $ensureParagraphAfterCard role.
    expect(readTableSummary(editor).rootTypes).toEqual(['table', 'paragraph'])
  })
})

describe('INSERT_TABLE_COMMAND (registerTableBehaviour)', () => {
  it('inserts the default table and lands the caret inside the first cell', async () => {
    const editor = createTestEditor()
    registerTableBehaviour(editor)
    commit(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
    await dispatch(editor, {})
    const summary = readTableSummary(editor)
    expect(summary.rowCount).toBe(3)
    expect(summary.columnCount).toBe(3)
    expect(summary.headerStyles[0]).toEqual([
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
    ])
    const caretCell = editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        throw new Error('no range selection after insert')
      }
      let node: ReturnType<typeof selection.anchor.getNode> | null = selection.anchor.getNode()
      while (node !== null) {
        if ($isTableCellNode(node)) {
          return node.getKey()
        }
        node = node.getParent()
      }
      return null
    })
    expect(caretCell).toBe(editor.getEditorState().read(() => $cell(0, 0).getKey()))
  })

  it('honours an explicit rows/columns/header payload', async () => {
    const editor = createTestEditor()
    registerTableBehaviour(editor)
    commit(editor, () => {
      const paragraph = $createParagraphNode()
      $getRoot().append(paragraph)
      paragraph.select()
    })
    await dispatch(editor, { columns: 2, includeHeaderRow: false, rows: 4 })
    const summary = readTableSummary(editor)
    expect(summary.rowCount).toBe(4)
    expect(summary.columnCount).toBe(2)
    expect(summary.headerStyles).toEqual([
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
    ])
  })
})

describe('header state mapping', () => {
  it('hasHeader() follows setHeaderStyles() round trips', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 2, includeHeaderRow: true, rows: 2 })
    const readHeader = () =>
      editor.getEditorState().read(() => ({
        hasHeader: $cell(0, 0).hasHeader(),
        styles: $cell(0, 0).getHeaderStyles(),
      }))
    expect(readHeader()).toEqual({ hasHeader: true, styles: TableCellHeaderStates.ROW })

    commit(editor, () => {
      $cell(0, 0).setHeaderStyles(TableCellHeaderStates.BOTH)
    })
    expect(readHeader()).toEqual({ hasHeader: true, styles: TableCellHeaderStates.BOTH })

    commit(editor, () => {
      $cell(0, 0).setHeaderStyles(TableCellHeaderStates.NO_STATUS)
    })
    expect(readHeader()).toEqual({ hasHeader: false, styles: TableCellHeaderStates.NO_STATUS })
  })
})

describe('table editor-state serialization', () => {
  it('round-trips rows and header states through JSON', () => {
    const editor = createTestEditor()
    insertTable(editor, { columns: 2, includeHeaderRow: true, rows: 2 })
    const reparsed = editor.parseEditorState(editor.getEditorState().toJSON())
    const summary = reparsed.read(() => {
      const table = $firstTable()
      return {
        headerStyles: (table.getChildren()[0] as TableRowNode)
          .getChildren()
          .map((cell) => (cell as TableCellNode).getHeaderStyles()),
        rowCount: table.getChildren().length,
      }
    })
    expect(summary.rowCount).toBe(2)
    expect(summary.headerStyles).toEqual([TableCellHeaderStates.ROW, TableCellHeaderStates.ROW])
  })
})
