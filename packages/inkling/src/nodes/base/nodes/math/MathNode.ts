import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
} from '@/nodes/base/generate-decorator-node'
import { renderMathNode } from '@/nodes/base/nodes/math/math-renderer'

const mathProperties = [
  // the artifact-slot invariant as spec data: editing `tex` clears the
  // prerendered `mathml`/`svg` (edit-invalidates)
  { name: 'tex', default: '', wordCount: true, invalidates: ['mathml', 'svg'] },
  // Server-prerendered artifacts (KaTeX MathML / SVG), carried opaquely —
  // inkling never runs KaTeX (CSP); the host fills them on save.
  { name: 'mathml', default: '', urlType: 'html' },
  { name: 'svg', default: '', urlType: 'html' },
] as const satisfies readonly DecoratorNodeProperty[]

export type MathData = DecoratorNodeData<typeof mathProperties>

export interface BaseMathNode extends DecoratorNodeValueMap<typeof mathProperties> {}

export class BaseMathNode extends generateDecoratorNode({
  nodeType: 'math',
  properties: mathProperties,
  defaultRenderFn: renderMathNode,
}) {
  // the artifact-slot invalidation (edit clears `mathml`/`svg`) is spec
  // data on the `tex` property above — the generated setter enforces it
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
