import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { parseCodeBlockNode } from '@/nodes/base/nodes/codeblock/codeblock-parser'
import { renderCodeBlockNode } from '@/nodes/base/nodes/codeblock/codeblock-renderer'

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

export interface BaseCodeBlockNode extends DecoratorNodeValueMap<typeof codeBlockProperties> {}

export class BaseCodeBlockNode extends generateDecoratorNode({
  nodeType: 'codeblock',
  properties: codeBlockProperties,
  defaultRenderFn: renderCodeBlockNode,
}) {
  static importDOM() {
    return parseCodeBlockNode(this)
  }

  // The transient-prop spec (codeblock.declaration.ts) initializes this only
  // on spec-adopting assembled classes; a raw `new BaseCodeBlockNode()`
  // leaves it unset, so `undefined` is part of the honest type for spec-less
  // instances
  declare __openInEditMode: boolean | undefined

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
