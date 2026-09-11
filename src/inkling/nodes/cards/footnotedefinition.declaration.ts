import type { NestedEditorSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { nullableNestedEditor } from '@/inkling/nodes/base/card-specs'
import { BaseFootnoteDefinitionNode } from '@/inkling/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import BASIC_NODES from '@/inkling/nodes/BasicNodes'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap). The
// nested editor rides nullableNestedEditor's carrier: the headless
// round-trip invariant detaches it (same shape as toggle's)
export const nestedEditors = [
  nullableNestedEditor({
    name: 'contentEditor',
    serializedKey: 'content',
    nodes: BASIC_NODES,
    cleanBasicHtml: { allowBr: true },
  }),
] as const satisfies readonly NestedEditorSpec[]

export const footnoteDefinitionDeclaration = {
  nodeType: 'footnotedefinition',
  baseNode: BaseFootnoteDefinitionNode,
  nestedEditors,
  decorateTarget: {
    width: 'regular',
  },
  // No menu, no insert — the footnote behaviour module
  // (`@/inkling/plugins/behaviour/footnotes`) creates and orders definitions; the
  // writer never inserts one from the slash menu (CodeBlock's menu-less
  // precedent).
  toolbarLabel: 'footnote',
  // Not in the markdown round-trip —
  // kobato interop goes through the wire dialect, not public markdown.
} satisfies CardDeclaration<'footnotedefinition'>
