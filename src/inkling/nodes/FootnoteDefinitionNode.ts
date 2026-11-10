import type { EditorState, LexicalEditor } from 'lexical'

import type { FootnoteDefinitionData } from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { footnoteDefinitionDeclaration } from '@/inkling/nodes/cards/footnotedefinition.declaration'

export { $isFootnoteDefinitionNode } from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
export type { FootnoteDefinitionData } from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

export type FootnoteDefinitionNodeDataset = FootnoteDefinitionData & {
  contentEditor?: LexicalEditor
  // accepted for getDataset/clone symmetry but not read by the constructor —
  // `__contentEditorInitialState` is set internally when the editor is
  // populated from its serialized HTML (@/inkling/nodes/nested-editors)
  contentEditorInitialState?: EditorState
}

/**
 * The registered footnote-definition card class, assembled once from its
 * declaration by `assembleCardNodeOnce`; `$isFootnoteDefinitionNode` stays
 * canonical on the base node. The instance type carries the spec-derived `__*`
 * field map, so `$createFootnoteDefinitionNode` needs no cast.
 */
export const FootnoteDefinitionNode = assembleCardNodeOnce(footnoteDefinitionDeclaration)
export type FootnoteDefinitionNode = InstanceType<typeof FootnoteDefinitionNode>

export const $createFootnoteDefinitionNode = (dataset?: FootnoteDefinitionNodeDataset): FootnoteDefinitionNode => {
  return new FootnoteDefinitionNode(dataset)
}
