import { BaseCalloutNode, calloutNestedEditors } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const calloutDeclaration = checkedCardDeclaration({
  nodeType: 'callout',
  baseNode: BaseCalloutNode,
  nestedEditors: calloutNestedEditors,
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
} satisfies CardDeclaration<'callout', typeof BaseCalloutNode, readonly [], typeof calloutNestedEditors>)
