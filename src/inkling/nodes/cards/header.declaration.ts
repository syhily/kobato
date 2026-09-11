import type { NestedEditorSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseHeaderNode, headerCardWidth } from '@/inkling/nodes/base/nodes/header/HeaderNode'
import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap)
export const nestedEditors = [
  {
    name: 'headerTextEditor',
    serializedKey: 'header',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { firstChildInnerContent: true, allowBr: true },
    // Header's dataset exposes the editors but not their initial states.
    exposeInitialStateInDataset: false,
  },
  {
    name: 'subheaderTextEditor',
    serializedKey: 'subheader',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { firstChildInnerContent: true, allowBr: true },
    exposeInitialStateInDataset: false,
  },
] as const satisfies readonly NestedEditorSpec[]

export const headerDeclaration = {
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors,
  decorateTarget: {
    width: headerCardWidth,
  },
  insert: { openInEditMode: true },
  menu: [
    {
      label: 'Header',
      labelKey: 'header',
      desc: 'Add a header',
      icon: 'header',
      command: 'insert',
      matches: ['header', 'heading'],
      priority: 11,
      insertParams: () => ({
        version: 2,
      }),
      shortcut: '/header',
    },
  ],
  toolbarLabel: 'header',
  // No markdown entry: the header card has no markdown representation.
} satisfies CardDeclaration<'header'>
