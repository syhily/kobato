import type { NestedEditorSpec, TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseCodeBlockNode } from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
import { captionEditorSpec } from '@/inkling/nodes/cards/caption-editor-spec'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap)
export const nestedEditors = [captionEditorSpec()] as const satisfies readonly NestedEditorSpec[]

export const transientProps = [
  // the `_openInEditMode` edit-mode flag is the same shape as the upload
  // cards' transient props: read from the construction dataset, never
  // serialized, cleared via the node's `clearOpenInEditMode`
  {
    name: '_openInEditMode',
    privateName: '__openInEditMode',
    initial: (dataset): boolean => Boolean(dataset._openInEditMode),
  },
] as const satisfies readonly TransientPropSpec[]

export const codeBlockDeclaration = {
  nodeType: 'codeblock',
  baseNode: BaseCodeBlockNode,
  nestedEditors,
  transientProps,
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
