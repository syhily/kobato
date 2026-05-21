import { Extension } from '@tiptap/core'
import { Slice, Fragment, Node } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const TABLE_CELL_GUARD_KEY = new PluginKey('tableCellGuard')

/** Marks that are not allowed inside a table cell per the PT table dialect. */
const ILLEGAL_MARK_NAMES = new Set(['mathInline', 'footnoteRef'])

function isInsideTableCell(state: {
  selection: { $from: { depth: number; node: (d: number) => { type: { name: string } } } }
}): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const nodeType = $from.node(d).type.name
    if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
      return true
    }
  }
  return false
}

function sanitizeNode(node: Node): Node {
  if (node.isText) {
    const legalMarks = node.marks.filter((m) => !ILLEGAL_MARK_NAMES.has(m.type.name))
    if (legalMarks.length === node.marks.length) {
      return node
    }
    return node.type.schema.text(node.text ?? '', legalMarks)
  }

  if (node.childCount === 0) {
    return node
  }

  const sanitized: Node[] = []
  node.forEach((child) => {
    sanitized.push(sanitizeNode(child))
  })

  return node.copy(Fragment.from(sanitized))
}

function sanitizeSlice(slice: Slice): Slice {
  const sanitized: Node[] = []
  slice.content.forEach((child) => {
    sanitized.push(sanitizeNode(child))
  })

  return new Slice(Fragment.from(sanitized), slice.openStart, slice.openEnd)
}

/**
 * ProseMirror plugin that strips illegal marks from content pasted or dropped
 * into a table cell. The PT table dialect permits inline spans, link marks,
 * and code marks inside cells; mathInline and footnoteRef marks are silently
 * removed so the user is not surprised by content that disappears on save.
 */
export const TableCellGuardExtension = Extension.create({
  name: 'tableCellGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: TABLE_CELL_GUARD_KEY,
        props: {
          transformPasted(slice, view) {
            if (!isInsideTableCell(view.state)) {
              return slice
            }
            return sanitizeSlice(slice)
          },
          handleDrop(view, event, slice, _moved) {
            if (!isInsideTableCell(view.state)) {
              return false
            }
            const sanitized = sanitizeSlice(slice)
            if (sanitized === slice) {
              return false
            }
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (coords === null) {
              return false
            }
            view.dispatch(view.state.tr.replace(coords.pos, coords.pos, sanitized))
            return true
          },
        },
      }),
    ]
  },
})
