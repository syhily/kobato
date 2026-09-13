import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@/inkling/nodes/base/nodes/caption-editor-spec'
import { parseCodeBlockNode } from '@/inkling/nodes/base/nodes/codeblock/codeblock-parser'
import { renderCodeBlockNode } from '@/inkling/nodes/base/nodes/codeblock/codeblock-renderer'

// the card's spec arrays live here, beside the class they type — see the
// videoNestedEditors note
export const codeBlockNestedEditors = [captionEditorSpecBase] as const satisfies readonly NestedEditorSpec[]

export const codeBlockTransientProps = [
  // the `_openInEditMode` edit-mode flag is the same shape as the upload
  // cards' transient props: read from the construction dataset, never
  // serialized, cleared via the node's `clearOpenInEditMode`
  {
    name: '_openInEditMode',
    privateName: '__openInEditMode',
    initial: (dataset): boolean => Boolean(dataset._openInEditMode),
  },
] as const satisfies readonly TransientPropSpec[]

const codeBlockProperties = [
  // the artifact-slot invariant as spec data: editing the source clears the
  // prerendered `highlightedHtml` (edit-invalidates — construction/importJSON
  // assign the private fields directly, so host-filled slots survive)
  { name: 'code', default: '', wordCount: true, invalidates: ['highlightedHtml'] },
  { name: 'language', default: '', invalidates: ['highlightedHtml'] },
  { name: 'caption', default: '', urlType: 'html', wordCount: true },
  // Server-prerendered highlight artifact (Shiki HTML), carried opaquely —
  // inkling never runs Shiki (CSP); the host fills it on save.
  { name: 'highlightedHtml', default: '', urlType: 'html' },
] as const satisfies readonly DecoratorNodeProperty[]

export type CodeBlockData = DecoratorNodeData<typeof codeBlockProperties>

export type SerializedCodeBlockNode = SerializedGeneratedDecoratorNode<
  DecoratorNodeValueMap<typeof codeBlockProperties>
>

// the merged interface self-types the spec-driven fields — see the
// BaseAudioNode note
export interface BaseCodeBlockNode
  // oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
  extends CardSpecFieldMapFor<typeof codeBlockTransientProps, typeof codeBlockNestedEditors> {}
export class BaseCodeBlockNode extends generateDecoratorNode({
  nodeType: 'codeblock',
  properties: codeBlockProperties,
  defaultRenderFn: renderCodeBlockNode,
}) {
  static importDOM() {
    return parseCodeBlockNode(this)
  }

  // Clears the transient `_openInEditMode` flag the card spec initializes
  // from the construction dataset; a no-op for spec-less instances.
  clearOpenInEditMode() {
    const self = this.getWritable()
    self.__openInEditMode = false
  }

  // the artifact-slot invalidation (edit clears `highlightedHtml`) is spec
  // data on the `code`/`language` properties above — the generated setters
  // enforce it
  isEmpty() {
    return !this.__code
  }
}

export function $createBaseCodeBlockNode(dataset: CodeBlockData = {}) {
  return new BaseCodeBlockNode(dataset)
}

export function $isCodeBlockNode(node: unknown): node is BaseCodeBlockNode {
  return node instanceof BaseCodeBlockNode
}
