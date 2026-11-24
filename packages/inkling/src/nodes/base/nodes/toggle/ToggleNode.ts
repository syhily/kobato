import type {
  DecoratorNodeProperty,
  NestedEditorFieldMap,
  NestedEditorSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { renderToggleNode } from '@kobato/inkling-internal/nodes/base/nodes/toggle/toggle-renderer'
import BASIC_NODES from '@kobato/inkling-internal/nodes/BasicNodes'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import { $canShowPlaceholderCurry } from '@lexical/text'

export const toggleNestedEditors = [
  {
    name: 'titleEditor',
    serializedKey: 'heading',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { firstChildInnerContent: true, allowBr: true },
    nullable: true,
  },
  {
    name: 'contentEditor',
    serializedKey: 'content',
    nodes: BASIC_NODES,
    cleanBasicHtml: { allowBr: true },
    nullable: true,
  },
] as const satisfies readonly NestedEditorSpec[]

const toggleProperties = [
  { name: 'heading', default: '', urlType: 'html', wordCount: true },
  { name: 'content', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export const toggleImportSpec = {
  conversions: [
    {
      tag: 'div',
      priority: 1,
      guardClass: 'inkling-toggle-card',
      reads: [
        { name: 'heading', kind: 'text', selector: '.inkling-toggle-heading-text', fallback: '' },
        { name: 'content', kind: 'text', selector: '.inkling-toggle-content', fallback: '' },
      ],
    },
  ],
} satisfies CardImportSpec

export type ToggleData = DecoratorNodeData<typeof toggleProperties>

export type SerializedToggleNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof toggleProperties>>

// oxlint-disable-next-line typescript/no-empty-object-type
export interface BaseToggleNode extends NestedEditorFieldMap<typeof toggleNestedEditors> {}
export class BaseToggleNode extends generateDecoratorNode({
  nodeType: 'toggle',
  properties: toggleProperties,
  defaultRenderFn: renderToggleNode,
  importSpec: toggleImportSpec,
}) {
  isEmpty() {
    if (!this.__titleEditor || !this.__contentEditor) {
      return false
    }
    const isTitleEmpty = this.__titleEditor.getEditorState().read($canShowPlaceholderCurry(false))
    const isContentEmpty = this.__contentEditor.getEditorState().read($canShowPlaceholderCurry(false))
    return isTitleEmpty && isContentEmpty
  }
}

export const $createBaseToggleNode = (dataset: ToggleData = {}) => {
  return new BaseToggleNode(dataset)
}

export function $isToggleNode(node: unknown): node is BaseToggleNode {
  return node instanceof BaseToggleNode
}
