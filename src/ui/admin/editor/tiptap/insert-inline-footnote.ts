import type { Editor } from '@tiptap/core'

import type { FootnoteDefinitionBlock } from '@/shared/pt/schema'

import { isRecord } from '@/shared/utils/type-guards'

/** Footnote refs are inline marks; tables/code blocks cannot carry them on save (see pt-bridge). */
export function canInsertFootnoteMark(editor: Editor): boolean {
  if (!editor.isEditable) {
    return false
  }
  if (editor.isActive('table')) {
    return false
  }
  if (editor.isActive('codeBlock')) {
    return false
  }
  return true
}

/** Next visible footnote index (1-based) from parallel defs + inline refs (+ legacy blockCard payloads). */
export function computeNextFootnoteIndex(editor: Editor, defs: readonly FootnoteDefinitionBlock[]): number {
  let max = 0
  for (const d of defs) {
    if (typeof d.index === 'number' && Number.isFinite(d.index)) {
      max = Math.max(max, Math.floor(d.index))
    }
  }
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'blockCard') {
      const payload: unknown = node.attrs.payload
      if (
        isRecord(payload) &&
        payload._type === 'footnoteDefinition' &&
        typeof payload.index === 'number' &&
        Number.isFinite(payload.index)
      ) {
        max = Math.max(max, Math.floor(payload.index))
      }
      return true
    }
    if (node.isText) {
      for (const mark of node.marks) {
        if (mark.type.name === 'footnoteRef') {
          const attrs: Record<string, unknown> = mark.attrs
          const idx = attrs.index
          if (typeof idx === 'number' && Number.isFinite(idx)) {
            max = Math.max(max, Math.floor(idx))
          }
        }
      }
    }
    return true
  })
  return max + 1
}

export interface FootnoteRefInsertAttrs {
  defKey: string
  refMarkKey: string
  index: number
}

/**
 * Insert only the superscript `footnoteRef` at the caret (no definition block —
 * definitions are merged into PT outside the PM doc).
 */
export function insertFootnoteReferenceAtCaret(editor: Editor, attrs: FootnoteRefInsertAttrs): void {
  const label = String(attrs.index)
  const { from, to } = editor.state.selection
  let chain = editor.chain().focus()
  if (from < to) {
    chain = chain.deleteRange({ from, to })
  }
  chain
    .insertContent({
      type: 'text',
      text: label,
      marks: [
        {
          type: 'footnoteRef',
          attrs: { _key: attrs.refMarkKey, targetKey: attrs.defKey, index: attrs.index },
        },
      ],
    })
    .run()

  const caretAfter = editor.state.selection.anchor
  const inlineFrom = caretAfter - label.length
  const inlineTo = caretAfter
  if (inlineFrom >= 0 && label.length > 0) {
    editor.chain().focus().setTextSelection({ from: inlineFrom, to: inlineTo }).run()
  }
}

/** Deletes every `footnoteRef` mark range whose `targetKey` matches (newest positions first). */
export function removeFootnoteReferencesToTargetKey(editor: Editor, targetKey: string): boolean {
  if (targetKey === '') {
    return false
  }
  const markType = editor.schema.marks.footnoteRef
  if (markType === undefined) {
    return false
  }
  const { doc } = editor.state
  const ranges: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true
    }
    const hit = node.marks.find((m) => m.type === markType && m.attrs.targetKey === targetKey)
    if (hit !== undefined) {
      ranges.push({ from: pos, to: pos + node.nodeSize })
    }
    return true
  })
  if (ranges.length === 0) {
    return false
  }
  ranges.sort((a, b) => b.from - a.from)
  let { tr } = editor.state
  for (const range of ranges) {
    tr = tr.delete(range.from, range.to)
  }
  editor.view.dispatch(tr)
  return true
}
