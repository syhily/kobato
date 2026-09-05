import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderButtonNode } from '@/nodes/base/nodes/button/button-renderer'

const buttonProperties = [
  { name: 'buttonText', default: '' },
  { name: 'alignment', default: 'center' },
  { name: 'buttonUrl', default: '', urlType: 'url' },
] as const satisfies readonly DecoratorNodeProperty[]

export const buttonImportSpec = {
  conversions: [
    {
      tag: 'div',
      priority: 1,
      guardClass: 'inkling-button-card',
      reads: [
        { name: 'buttonUrl', kind: 'attribute', attribute: 'href', selector: '.inkling-btn', fallback: '' },
        { name: 'buttonText', kind: 'text', selector: '.inkling-btn', fallback: '' },
        // omitted on no class match, coalescing to the 'center' default
        { name: 'alignment', kind: 'classMap', classMap: [{ pattern: /inkling-align-(left|center)/ }] },
      ],
    },
  ],
} satisfies CardImportSpec

export type ButtonData = DecoratorNodeData<typeof buttonProperties>

export type SerializedButtonNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof buttonProperties>>

export interface BaseButtonNode extends DecoratorNodeValueMap<typeof buttonProperties> {}

export class BaseButtonNode extends generateDecoratorNode({
  nodeType: 'button',
  properties: buttonProperties,
  defaultRenderFn: renderButtonNode,
  importSpec: buttonImportSpec,
}) {}

export const $createBaseButtonNode = (dataset: ButtonData = {}) => {
  return new BaseButtonNode(dataset)
}

export function $isButtonNode(node: unknown): node is BaseButtonNode {
  return node instanceof BaseButtonNode
}
