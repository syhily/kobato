import type { FootnoteRefNode } from '@kobato/shared/lexical/nodes/footnote-ref-node'
import type { LexicalEditor } from 'lexical'

import { getFootnoteHandlers } from '@kobato/editor/engine/lexical/footnote-registry'
import { footnoteAnchorHref, footnoteRefId } from '@kobato/shared/lexical/footnote-anchors'
import { FOOTNOTE_REF_CLASS } from '@kobato/shared/lexical/html-manifest'

/**
 * Editor view for `FootnoteRefNode` — the inline `<sup>` of the public
 * render contract. `createDOM` already provides the `<sup
 * data-footnote-ref>` container (the decorator slot), so the view renders
 * only the anchor — an inner `<sup>` would nest a second element. R3b adds
 * the click-to-edit loop: in editable mode a click on the reference opens
 * the footnote edit dialog for its `targetKey` (the same interaction as
 * the tiptap engine's `handleClick` → `openFootnoteEditDialogRef`),
 * bridged through the engine's footnote registry so this core view never
 * imports the engine hook.
 */

interface FootnoteRefViewProps {
  node: FootnoteRefNode
  editor: LexicalEditor
}

export function FootnoteRefView({ node, editor }: FootnoteRefViewProps) {
  const index = node.getIndex()
  const editable = editor.isEditable()
  const targetKey = node.getTargetKey()

  return (
    <a
      id={footnoteRefId(index)}
      href={footnoteAnchorHref(index)}
      className={FOOTNOTE_REF_CLASS}
      data-footnote-target-key={targetKey}
      title={editable ? '点击编辑脚注' : undefined}
      role={editable ? 'button' : undefined}
      aria-label={editable ? '编辑脚注' : undefined}
      onClick={(event) => {
        if (!editable || targetKey === '') {
          return
        }
        event.preventDefault()
        getFootnoteHandlers(editor)?.openEditDialog(targetKey)
      }}
    >
      {index}
    </a>
  )
}
