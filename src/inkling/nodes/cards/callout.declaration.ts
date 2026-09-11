import type { NestedEditorSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { nullableNestedEditor } from '@/inkling/nodes/base/card-specs'
import { BaseCalloutNode } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap). The
// nested editor rides nullableNestedEditor's carrier: the markdown
// round-trip detaches it
export const nestedEditors = [
  nullableNestedEditor({
    name: 'calloutTextEditor',
    serializedKey: 'calloutText',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { allowBr: true },
  }),
] as const satisfies readonly NestedEditorSpec[]

export const calloutDeclaration = {
  nodeType: 'callout',
  baseNode: BaseCalloutNode,
  nestedEditors,
  menu: [
    {
      label: 'Callout',
      labelKey: 'callout',
      desc: 'Info boxes that stand out',
      icon: 'callout',
      command: 'insert',
      matches: ['callout'],
      priority: 9,
      shortcut: '/callout',
    },
  ],
  insert: { openInEditMode: true },
  toolbarLabel: 'callout',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'callout'>
