import { BaseHorizontalRuleNode } from '@/inkling/nodes/base/nodes/horizontalrule/HorizontalRuleNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

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
  // No toolbar renders for the divider; the label matches the node type.
  toolbarLabel: 'horizontalrule',
  // Markdown-eligible without a card fence: `HR` in `@/inkling/markdown/transformers`
  // owns `---`.
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'horizontalrule', typeof BaseHorizontalRuleNode, readonly [], readonly []>)
