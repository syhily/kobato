import type { DecoratorNodeProperty } from '../../card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '../../generate-decorator-node'
import { renderMarkdownNode } from './markdown-renderer'

const markdownProperties = [
  { name: 'markdown', default: '', urlType: 'markdown', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type MarkdownData = DecoratorNodeData<typeof markdownProperties>

export type SerializedMarkdownNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof markdownProperties>>

export class MarkdownNode extends generateDecoratorNode({
  nodeType: 'markdown',
  properties: markdownProperties,
  defaultRenderFn: renderMarkdownNode,
}) {
  isEmpty() {
    return !this.__markdown
  }
}

export function $createMarkdownNode(dataset: MarkdownData = {}) {
  return new MarkdownNode(dataset)
}

export function $isMarkdownNode(node: unknown): node is MarkdownNode {
  return node instanceof MarkdownNode
}
