import type { CardImportSpec } from '../../import-spec'

import { generateDecoratorNode } from '../../generate-decorator-node'
import { renderHorizontalRuleNode } from './horizontalrule-renderer'

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
