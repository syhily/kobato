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
  // No menu, no insert — the footnote behaviour module
  // (`@/inkling/plugins/behaviour/footnotes`) creates and orders definitions; the
  // writer never inserts one from the slash menu.
  toolbarLabel: 'footnote',
  // Not in the markdown round-trip —
  // kobato interop goes through the wire dialect, not public markdown.
} satisfies CardDeclaration<
  'footnotedefinition',
  typeof BaseFootnoteDefinitionNode,
  readonly [],
  typeof footnoteDefinitionNestedEditors
>)
