import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseHtmlNode } from '@/ui/inkling-editor/nodes/base/nodes/html/html-parser'
import { renderHtmlNode } from '@/ui/inkling-editor/nodes/base/nodes/html/html-renderer'

const htmlProperties = [
  { name: 'html', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type HtmlData = DecoratorNodeData<typeof htmlProperties, true>

export interface HtmlNode extends DecoratorNodeValueMap<typeof htmlProperties, true> {}

export class HtmlNode extends generateDecoratorNode({
  nodeType: 'html',
  hasVisibility: true,
  properties: htmlProperties,
  defaultRenderFn: renderHtmlNode,
}) {
  static importDOM() {
    return parseHtmlNode(this)
  }

  isEmpty() {
    return !this.__html
  }
}

export function $createHtmlNode(dataset: HtmlData = {}) {
  return new HtmlNode(dataset)
}

export function $isHtmlNode(node: unknown): node is HtmlNode {
  return node instanceof HtmlNode
}
