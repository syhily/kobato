import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { parseHtmlNode } from '@/nodes/base/nodes/html/html-parser'
import { renderHtmlNode } from '@/nodes/base/nodes/html/html-renderer'

const htmlProperties = [
  { name: 'html', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type HtmlData = DecoratorNodeData<typeof htmlProperties>

export type SerializedHtmlNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof htmlProperties>>

export interface BaseHtmlNode extends DecoratorNodeValueMap<typeof htmlProperties> {}

export class BaseHtmlNode extends generateDecoratorNode({
  nodeType: 'html',
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

export function $createBaseHtmlNode(dataset: HtmlData = {}) {
  return new BaseHtmlNode(dataset)
}

export function $isHtmlNode(node: unknown): node is BaseHtmlNode {
  return node instanceof BaseHtmlNode
}
