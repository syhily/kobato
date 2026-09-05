import type { LexicalEditor } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderToggleNode } from '@/nodes/base/nodes/toggle/toggle-renderer'

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

export interface BaseToggleNode extends DecoratorNodeValueMap<typeof toggleProperties> {}

export class BaseToggleNode extends generateDecoratorNode({
  nodeType: 'toggle',
  properties: toggleProperties,
  defaultRenderFn: renderToggleNode,
  importSpec: toggleImportSpec,
}) {
  // The generated constructor assigns the nested editors only on subclasses
  // that adopt a `nestedEditors` spec (the assembled card class); a raw
  // `new BaseToggleNode()` leaves them unset, and the markdown card
  // transformer nulls them after plain-text import — so `undefined` and
  // `null` are part of the honest type here (the
  // CodeBlockNode.__openInEditMode idiom).
  declare __titleEditor: LexicalEditor | null | undefined
  declare __contentEditor: LexicalEditor | null | undefined

  isEmpty() {
    // Null only inside the headless markdown round-trip editor (the toggle
    // card transformer nulls both nested editors after plain-text import),
    // and unset on spec-less base instances; isEmpty is dispatched from
    // commands those transient nodes never see — guard so the field type
    // stays honest. A nulled toggle is never auto-removed.
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
