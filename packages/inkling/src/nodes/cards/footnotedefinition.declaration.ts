import {
  BaseFootnoteDefinitionNode,
  footnoteDefinitionNestedEditors,
} from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const footnoteDefinitionDeclaration = checkedCardDeclaration({
  nodeType: 'footnotedefinition',
  baseNode: BaseFootnoteDefinitionNode,
  nestedEditors: footnoteDefinitionNestedEditors,
  decorateTarget: {
    width: 'regular',
  },
  toolbarLabel: 'footnote',
} satisfies CardDeclaration<
  'footnotedefinition',
  typeof BaseFootnoteDefinitionNode,
  readonly [],
  typeof footnoteDefinitionNestedEditors
>)
