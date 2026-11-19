import {
  BaseCodeBlockNode,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/codeblock/CodeBlockNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const codeBlockDeclaration = checkedCardDeclaration({
  nodeType: 'codeblock',
  baseNode: BaseCodeBlockNode,
  nestedEditors: codeBlockNestedEditors,
  transientProps: codeBlockTransientProps,
  decorateTarget: {
    wrapperStyle: 'code-card',
  },
  menu: [
    {
      label: 'Code',
      labelKey: 'codeblock',
      desc: 'Insert a code block',
      icon: 'codeblock',
      command: 'insert',
      matches: ['code', 'codeblock', 'pre'],
      priority: 12,
      shortcut: '/code',
    },
  ],
  insert: { openInEditMode: true },
  dragIcon: 'codeblock',
  toolbarLabel: 'code-block',

  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<
  'codeblock',
  typeof BaseCodeBlockNode,
  typeof codeBlockTransientProps,
  typeof codeBlockNestedEditors
>)
