import { BaseHorizontalRuleNode } from '@/nodes/base/nodes/horizontalrule/HorizontalRuleNode'

import type { CardDeclaration } from './card-declaration'

export const horizontalRuleDeclaration = {
  nodeType: 'horizontalrule',
  baseNode: BaseHorizontalRuleNode,
  // No decorateTarget: the card renders with no wrapper props. It
  // historically passed `className="inline-block"`, but `InklingCardWrapper`
  // never destructured it — the prop was inert and is dropped here.
  menu: [
    {
      label: 'Divider',
      labelKey: 'divider',
      desc: 'Insert a dividing line',
      icon: 'divider',
      command: 'insert',
      matches: ['divider', 'horizontal-rule', 'hr'],
      priority: 2,
      shortcut: '/hr',
    },
  ],
  // no toolbar renders for the divider today; the label matches the node type
  toolbarLabel: 'horizontalrule',
  // Markdown-eligible with no card fence: `---` is handled by
  // DEFAULT_TRANSFORMERS (`HR` in `@/markdown/transformers`).
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'horizontalrule'>
