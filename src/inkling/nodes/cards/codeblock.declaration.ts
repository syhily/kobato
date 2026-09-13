import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import {
  BaseCodeBlockNode,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'

export const codeBlockDeclaration = {
  nodeType: 'codeblock',
  baseNode: BaseCodeBlockNode,
  nestedEditors: codeBlockNestedEditors,
  transientProps: codeBlockTransientProps,
  decorateTarget: {
    wrapperStyle: 'code-card',
  },
  // The slash menu entry exists so hosts that compose a trimmed comment-level
  // surface (no markdown fence typing habit) can still insert a code card;
  // typing a markdown code fence keeps working on the full surface.
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
  // diverges from the node type: the toolbar label is a live e2e selector
  // contract ("code-block"), not a transform of "codeblock"
  toolbarLabel: 'code-block',
  // Markdown-eligible with no card fence: the code fence is handled
  // by DEFAULT_TRANSFORMERS (`CODE_BLOCK` in `@/inkling/markdown/transformers`).
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'codeblock'>
