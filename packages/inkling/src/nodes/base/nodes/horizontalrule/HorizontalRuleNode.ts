import type { CardImportSpec } from '@/nodes/base/import-spec'

import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { renderHorizontalRuleNode } from '@/nodes/base/nodes/horizontalrule/horizontalrule-renderer'

export const horizontalRuleImportSpec = {
  conversions: [{ tag: 'hr', priority: 0, reads: [] }],
} satisfies CardImportSpec

export class BaseHorizontalRuleNode extends generateDecoratorNode({
  nodeType: 'horizontalrule',
  defaultRenderFn: renderHorizontalRuleNode,
  importSpec: horizontalRuleImportSpec,
  hasEditMode: false,
}) {
  getTextContent() {
    return '---\n\n'
  }
}

export function $createBaseHorizontalRuleNode() {
  return new BaseHorizontalRuleNode()
}

export function $isHorizontalRuleNode(node: unknown): node is BaseHorizontalRuleNode {
  return node instanceof BaseHorizontalRuleNode
}
