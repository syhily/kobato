import type { EditorState, LexicalEditor } from 'lexical'

import type { FootnoteDefinitionData } from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { footnoteDefinitionDeclaration } from '@/nodes/cards/footnotedefinition.declaration'

export { $isFootnoteDefinitionNode } from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
export type { FootnoteDefinitionData } from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

export type FootnoteDefinitionNodeDataset = FootnoteDefinitionData & {
  contentEditor?: LexicalEditor
  // accepted for getDataset/clone symmetry but not read by the constructor —
  // `__contentEditorInitialState` is set internally when the editor is
  // populated from its serialized HTML (src/nodes/nested-editors.ts)
  contentEditorInitialState?: EditorState
}

/**
 * The registered footnote-definition card class, assembled once from its
 * declaration (`@/nodes/assemble-card-node`); `$isFootnoteDefinitionNode`
 * stays canonical on the base node. The instance type carries the
 * spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so
 * `$createFootnoteDefinitionNode` constructs the assembled class — which
 * sets up the nested-editor spec — with no cast.
 */
export const FootnoteDefinitionNode = assembleCardNodeOnce(footnoteDefinitionDeclaration)
export type FootnoteDefinitionNode = InstanceType<typeof FootnoteDefinitionNode>

export const $createFootnoteDefinitionNode = (dataset?: FootnoteDefinitionNodeDataset): FootnoteDefinitionNode => {
  // the nested-editor fields are set up by the constructor from the dataset
  return new FootnoteDefinitionNode(dataset)
}
