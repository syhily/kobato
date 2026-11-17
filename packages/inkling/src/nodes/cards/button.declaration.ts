import { BaseButtonNode } from '../base/nodes/button/ButtonNode'
import { checkedCardDeclaration, type CardDeclaration } from './card-declaration'

export const buttonDeclaration = checkedCardDeclaration({
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
} satisfies CardDeclaration<'button', typeof BaseButtonNode, readonly [], readonly []>)
