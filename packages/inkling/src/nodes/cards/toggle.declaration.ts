import { BaseToggleNode, toggleNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const toggleDeclaration = checkedCardDeclaration({
  nodeType: 'toggle',
  baseNode: BaseToggleNode,
  nestedEditors: toggleNestedEditors,
  decorateTarget: {
    width: 'regular',
  },
  menu: [
    {
      label: 'Toggle',
      labelKey: 'toggle',
      desc: 'Collapsible content block',
      icon: 'toggle',
      command: 'insert',
      insertParams: {},
      matches: ['toggle', 'collapsible', 'accordion'],
      priority: 16,
      shortcut: '/toggle',
    },
  ],
  insert: { openInEditMode: true },
  toolbarLabel: 'toggle',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'toggle', typeof BaseToggleNode, readonly [], typeof toggleNestedEditors>)
