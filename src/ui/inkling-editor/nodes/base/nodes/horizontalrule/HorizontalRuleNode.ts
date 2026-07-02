import { generateDecoratorNode } from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseHorizontalRuleNode } from '@/ui/inkling-editor/nodes/base/nodes/horizontalrule/horizontalrule-parser'
import { renderHorizontalRuleNode } from '@/ui/inkling-editor/nodes/base/nodes/horizontalrule/horizontalrule-renderer'

export class HorizontalRuleNode extends generateDecoratorNode({
  nodeType: 'horizontalrule',
  defaultRenderFn: renderHorizontalRuleNode,
}) {
  static importDOM() {
    return parseHorizontalRuleNode(this)
  }

  getTextContent() {
    return '---\n\n'
  }

  hasEditMode() {
    return false
  }
}

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}

export function $isHorizontalRuleNode(node: unknown): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode
}
