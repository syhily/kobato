import type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

import { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
import { renderHorizontalRuleNode } from '@/inkling/nodes/base/nodes/horizontalrule/horizontalrule-renderer'

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
