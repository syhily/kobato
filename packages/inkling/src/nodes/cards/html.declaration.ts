import { BaseHtmlNode } from '@/nodes/base/nodes/html/HtmlNode'

import type { CardDeclaration } from './card-declaration'

export const htmlDeclaration = {
  nodeType: 'html',
  baseNode: BaseHtmlNode,
  decorateTarget: {
    wrapperStyle: 'wide',
    // the icon component attaches one layer up (`@/nodes/HtmlNodeComponent`)
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
