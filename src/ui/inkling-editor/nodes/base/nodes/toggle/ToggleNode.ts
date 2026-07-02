import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseToggleNode } from '@/ui/inkling-editor/nodes/base/nodes/toggle/toggle-parser'
import { renderToggleNode } from '@/ui/inkling-editor/nodes/base/nodes/toggle/toggle-renderer'

const toggleProperties = [
  { name: 'heading', default: '', urlType: 'html', wordCount: true },
  { name: 'content', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export type ToggleData = DecoratorNodeData<typeof toggleProperties>

export interface ToggleNode extends DecoratorNodeValueMap<typeof toggleProperties> {}

export class ToggleNode extends generateDecoratorNode({
  nodeType: 'toggle',
  properties: toggleProperties,
  defaultRenderFn: renderToggleNode,
}) {
  static importDOM() {
    return parseToggleNode(this)
  }
}

export const $createToggleNode = (dataset: ToggleData = {}) => {
  return new ToggleNode(dataset)
}

export function $isToggleNode(node: unknown): node is ToggleNode {
  return node instanceof ToggleNode
}
