import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseHtmlNode } from '@/inkling/nodes/base/nodes/html/HtmlNode'

export const htmlDeclaration = {
  nodeType: 'html',
  baseNode: BaseHtmlNode,
  decorateTarget: {
    wrapperStyle: 'wide',
    // the icon component attaches one layer up (`@/inkling/nodes/HtmlNodeComponent`)
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
} satisfies CardDeclaration<'html'>
