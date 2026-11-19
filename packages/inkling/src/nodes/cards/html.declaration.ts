import { BaseHtmlNode } from '@kobato/inkling-internal/nodes/base/nodes/html/HtmlNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const htmlDeclaration = checkedCardDeclaration({
  nodeType: 'html',
  baseNode: BaseHtmlNode,
  decorateTarget: {
    wrapperStyle: 'wide',
    hasIndicatorIcon: true,
  },
  menu: [
    {
      label: 'HTML',
      labelKey: 'html',
      desc: 'Insert a HTML editor card',
      icon: 'html',
      command: 'insert',
      matches: ['html'],
      priority: 18,
      shortcut: '/html',
    },
  ],
  insert: { openInEditMode: true },
  toolbarLabel: 'html',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'html', typeof BaseHtmlNode, readonly [], readonly []>)
