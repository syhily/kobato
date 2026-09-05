import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'

import { BaseCodeBlockNode } from '@/nodes/base/nodes/codeblock/CodeBlockNode'

import type { CardDeclaration } from './card-declaration'

import { captionEditorSpec } from './caption-editor-spec'

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
  // No menu entry — the code block is inserted by its markdown code fence —
  // so the drag-preview icon is named explicitly instead.
  dragIcon: 'codeblock',
  // diverges from the node type: the toolbar label is a live e2e selector
  // contract ("code-block"), not a transform of "codeblock"
  toolbarLabel: 'code-block',
  // Markdown-eligible with no card fence: the code fence is handled
  // by DEFAULT_TRANSFORMERS (`CODE_BLOCK` in `@/markdown/transformers`).
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'codeblock'>
