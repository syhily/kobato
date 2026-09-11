import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseButtonNode } from '@/inkling/nodes/base/nodes/button/ButtonNode'

export const buttonDeclaration = {
  nodeType: 'button',
  baseNode: BaseButtonNode,
  decorateTarget: {
    width: 'regular',
    wrapperStyle: 'wide',
  },
  menu: [
    {
      label: 'Button',
      labelKey: 'button',
      desc: 'Call-to-action button',
      icon: 'button',
      command: 'insert',
      insertParams: {},
      matches: ['button', 'btn'],
      priority: 16,
      shortcut: '/button',
    },
  ],
  insert: { openInEditMode: true },
  toolbarLabel: 'button',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'button'>
