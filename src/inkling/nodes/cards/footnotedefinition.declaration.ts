import {
  BaseFootnoteDefinitionNode,
  footnoteDefinitionNestedEditors,
} from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const footnoteDefinitionDeclaration = checkedCardDeclaration({
  nodeType: 'footnotedefinition',
  baseNode: BaseFootnoteDefinitionNode,
  nestedEditors: footnoteDefinitionNestedEditors,
  decorateTarget: {
    width: 'regular',
  },
  // No menu and no insert entry: the footnote behaviour module creates and orders
  // definitions, so the writer never inserts one from the slash menu.
  toolbarLabel: 'footnote',
  // Absent from the markdown round-trip: kobato interop uses the wire dialect.
} satisfies CardDeclaration<
  'footnotedefinition',
  typeof BaseFootnoteDefinitionNode,
  readonly [],
  typeof footnoteDefinitionNestedEditors
>)
