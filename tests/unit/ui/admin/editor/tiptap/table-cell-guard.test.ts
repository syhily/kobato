import type { EditorView } from '@tiptap/pm/view'

import { Fragment, Schema, Slice, type Node as PmNode } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Plugin, type Transaction } from '@tiptap/pm/state'
import { describe, expect, it, vi } from 'vitest'

import { TableCellGuardExtension } from '@/ui/admin/editor/tiptap/table-cell-guard'

// Minimal schema mirroring the PT table dialect: cells hold a single
// paragraph of inline text; mathInline / footnoteRef are the illegal marks
// the guard strips inside cells.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    table: { content: 'tableRow+', group: 'block' },
    tableRow: { content: '(tableCell|tableHeader)+' },
    tableCell: { content: 'paragraph' },
    tableHeader: { content: 'paragraph' },
  },
  marks: {
    mathInline: {},
    footnoteRef: {},
  },
})

function paragraphWith(text: string, marks: string[] = []): PmNode {
  const markInstances = marks.map((name) => schema.marks[name]!.create())
  return schema.nodes.paragraph.create(null, schema.text(text, markInstances))
}

/** doc > table > tableRow > tableCell > paragraph('cell'); selection inside the cell. */
function stateInsideCell(): EditorState {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [schema.nodes.tableCell.create(null, paragraphWith('cell'))]),
    ]),
  ])
  // doc(0) table(1) tableRow(2) tableCell(3) paragraph(4) text starts at 4.
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, 5) })
}

function stateOutsideCell(): EditorState {
  const doc = schema.nodes.doc.create(null, [paragraphWith('body')])
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1) })
}

function stubView(
  state: EditorState,
  posAtCoordsResult: { pos: number; inside: number } | null = { pos: 1, inside: -1 },
) {
  return {
    dispatch: vi.fn(),
    view: {
      state,
      posAtCoords: vi.fn(() => posAtCoordsResult),
      dispatch: undefined as unknown,
    } as unknown as EditorView,
  }
}

function dropPlugin(): Plugin {
  const addPlugins = TableCellGuardExtension.config.addProseMirrorPlugins as unknown as () => Plugin[]
  return addPlugins()[0]!
}

function handleDrop(view: EditorView, slice: Slice) {
  const plugin = dropPlugin()
  const handler = plugin.props.handleDrop!
  return handler.call(plugin, view, { clientX: 10, clientY: 10 } as DragEvent, slice, false)
}

describe('table-cell-guard — handleDrop', () => {
  it('lets an unsanitized (already legal) slice fall through to ProseMirror default drop handling', () => {
    // Audit P1-2: sanitizeSlice always built a NEW Slice, so the identity
    // check never held and every cell drop bypassed the default drop logic
    // (selection placement, openStart/openEnd semantics).
    const { view, dispatch } = stubView(stateInsideCell())
    ;(view as { dispatch: unknown }).dispatch = dispatch
    const slice = new Slice(Fragment.from(paragraphWith('plain')), 0, 0)

    const handled = handleDrop(view, slice)

    expect(handled).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('intercepts a slice carrying illegal marks, strips them, and dispatches the replace', () => {
    const { view, dispatch } = stubView(stateInsideCell())
    ;(view as { dispatch: unknown }).dispatch = dispatch
    const slice = new Slice(Fragment.from(paragraphWith('x^2', ['mathInline'])), 0, 0)

    const handled = handleDrop(view, slice)

    expect(handled).toBe(true)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const tr = dispatch.mock.calls[0]![0] as Transaction
    let illegalMarks = 0
    tr.doc.descendants((node) => {
      illegalMarks += node.marks.filter((m) => m.type.name === 'mathInline' || m.type.name === 'footnoteRef').length
      return true
    })
    expect(illegalMarks).toBe(0)
    expect(tr.doc.textBetween(0, tr.doc.content.size)).toContain('x^2')
  })

  it('ignores drops outside a table cell', () => {
    const { view, dispatch } = stubView(stateOutsideCell())
    ;(view as { dispatch: unknown }).dispatch = dispatch
    const slice = new Slice(Fragment.from(paragraphWith('x^2', ['mathInline'])), 0, 0)

    expect(handleDrop(view, slice)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('falls through when the drop coordinates resolve to no position', () => {
    const { view, dispatch } = stubView(stateInsideCell(), null)
    ;(view as { dispatch: unknown }).dispatch = dispatch
    const slice = new Slice(Fragment.from(paragraphWith('x^2', ['mathInline'])), 0, 0)

    expect(handleDrop(view, slice)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('table-cell-guard — transformPasted', () => {
  it('strips illegal marks from slices pasted inside a cell', () => {
    const plugin = dropPlugin()
    const transform = plugin.props.transformPasted!
    const slice = new Slice(Fragment.from(paragraphWith('fn', ['footnoteRef'])), 0, 0)
    const out = transform.call(plugin, slice, { state: stateInsideCell() } as EditorView, false)
    let illegalMarks = 0
    out.content.descendants((node) => {
      illegalMarks += node.marks.filter((m) => m.type.name === 'footnoteRef').length
      return true
    })
    expect(illegalMarks).toBe(0)
  })

  it('leaves slices pasted outside a cell untouched', () => {
    const plugin = dropPlugin()
    const transform = plugin.props.transformPasted!
    const slice = new Slice(Fragment.from(paragraphWith('fn', ['footnoteRef'])), 0, 0)
    const out = transform.call(plugin, slice, { state: stateOutsideCell() } as EditorView, false)
    expect(out).toBe(slice)
  })
})
