import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { renderMarkdownNode } from '@/ui/inkling-editor/nodes/base/nodes/markdown/markdown-renderer'

const markdownProperties = [
  { name: 'markdown', default: '', urlType: 'markdown', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type MarkdownData = DecoratorNodeData<typeof markdownProperties>

export interface MarkdownNode extends DecoratorNodeValueMap<typeof markdownProperties> {}

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
