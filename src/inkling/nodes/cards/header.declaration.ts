import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseHeaderNode, headerCardWidth, headerNestedEditors } from '@/inkling/nodes/base/nodes/header/HeaderNode'

export const headerDeclaration = {
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors: headerNestedEditors,
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
