import type { FootnoteDefinitionData } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import type { EditorState, LexicalEditor } from 'lexical'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { footnoteDefinitionDeclaration } from '@kobato/inkling-internal/nodes/cards/footnotedefinition.declaration'

export { $isFootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
export type { FootnoteDefinitionData } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'

export type FootnoteDefinitionNodeDataset = FootnoteDefinitionData & {
  contentEditor?: LexicalEditor
  // accepted for getDataset/clone symmetry but not read by the constructor —
  // `__contentEditorInitialState` is set internally when the editor is
  // populated from its serialized HTML (@kobato/inkling-internal/nodes/nested-editors)
  contentEditorInitialState?: EditorState
}

export const FootnoteDefinitionNode = assembleCardNodeOnce(footnoteDefinitionDeclaration)
export type FootnoteDefinitionNode = InstanceType<typeof FootnoteDefinitionNode>
export const $createFootnoteDefinitionNode = (dataset?: FootnoteDefinitionNodeDataset): FootnoteDefinitionNode => {
  return new FootnoteDefinitionNode(dataset)
}
