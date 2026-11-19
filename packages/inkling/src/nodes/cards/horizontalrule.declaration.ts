import { BaseHorizontalRuleNode } from '@kobato/inkling-internal/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const horizontalRuleDeclaration = checkedCardDeclaration({
  nodeType: 'horizontalrule',
  baseNode: BaseHorizontalRuleNode,
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
  toolbarLabel: 'horizontalrule',
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'horizontalrule', typeof BaseHorizontalRuleNode, readonly [], readonly []>)
