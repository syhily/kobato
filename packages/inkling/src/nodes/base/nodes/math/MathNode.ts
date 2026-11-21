import type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { renderMathNode } from '@kobato/inkling-internal/nodes/base/nodes/math/math-renderer'

const mathProperties = [
  { name: 'tex', default: '', wordCount: true, invalidates: ['mathml', 'svg'] },
  { name: 'mathml', default: '', urlType: 'html' },
  { name: 'svg', default: '', urlType: 'html' },
] as const satisfies readonly DecoratorNodeProperty[]

export type MathData = DecoratorNodeData<typeof mathProperties>

export class BaseMathNode extends generateDecoratorNode({
  nodeType: 'math',
  properties: mathProperties,
  defaultRenderFn: renderMathNode,
}) {
  isEmpty() {
    return !this.__tex
  }
}

export function $createBaseMathNode(dataset: MathData = {}) {
  return new BaseMathNode(dataset)
}

export function $isMathNode(node: unknown): node is BaseMathNode {
  return node instanceof BaseMathNode
}
