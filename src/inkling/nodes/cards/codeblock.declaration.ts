import {
  BaseCodeBlockNode,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const codeBlockDeclaration = checkedCardDeclaration({
  nodeType: 'codeblock',
  baseNode: BaseCodeBlockNode,
  nestedEditors: codeBlockNestedEditors,
  transientProps: codeBlockTransientProps,
  decorateTarget: {
    wrapperStyle: 'code-card',
  },
  // Trimmed comment-level surfaces have no fence-typing habit, so the menu entry
  // stays available there; the full surface keeps the markdown fence path.
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
  // Live e2e selector contract ("code-block"), deliberately not a transform of "codeblock"
  toolbarLabel: 'code-block',
  // Markdown-eligible without a card fence: `CODE_BLOCK` in
  // `@/inkling/markdown/transformers` owns the fence.
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<
  'codeblock',
  typeof BaseCodeBlockNode,
  typeof codeBlockTransientProps,
  typeof codeBlockNestedEditors
>)
