import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { captionEditorSpecBase } from '@kobato/inkling-internal/nodes/base/nodes/caption-editor-spec'
import { parseCodeBlockNode } from '@kobato/inkling-internal/nodes/base/nodes/codeblock/codeblock-parser'
import { renderCodeBlockNode } from '@kobato/inkling-internal/nodes/base/nodes/codeblock/codeblock-renderer'

export const codeBlockNestedEditors = [captionEditorSpecBase] as const satisfies readonly NestedEditorSpec[]

export const codeBlockTransientProps = [
  {
    name: '_openInEditMode',
    privateName: '__openInEditMode',
    initial: (dataset): boolean => Boolean(dataset._openInEditMode),
  },
] as const satisfies readonly TransientPropSpec[]

const codeBlockProperties = [
  { name: 'code', default: '', wordCount: true, invalidates: ['highlightedHtml'] },
  { name: 'language', default: '', invalidates: ['highlightedHtml'] },
  { name: 'caption', default: '', urlType: 'html', wordCount: true },
  { name: 'highlightedHtml', default: '', urlType: 'html' },
] as const satisfies readonly DecoratorNodeProperty[]

export type CodeBlockData = DecoratorNodeData<typeof codeBlockProperties>

export type SerializedCodeBlockNode = SerializedGeneratedDecoratorNode<
  DecoratorNodeValueMap<typeof codeBlockProperties>
>

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

  clearOpenInEditMode() {
    const self = this.getWritable()
    self.__openInEditMode = false
  }

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
