import { $canShowPlaceholderCurry } from '@lexical/text'

import type { DecoratorNodeProperty, NestedEditorFieldMap, NestedEditorSpec } from '@/inkling/nodes/base/card-specs'
import type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/inkling/nodes/base/generate-decorator-node'
import { renderToggleNode } from '@/inkling/nodes/base/nodes/toggle/toggle-renderer'
import BASIC_NODES from '@/inkling/nodes/BasicNodes'
import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'

// The card's nested-editor spec (CONTEXT.md: "card spec") lives here, beside
// the class it types — the declaration imports it from this module. Both
// editors are `nullable`: the markdown round-trip detaches them. The
// MINIMAL/BASIC node-set imports run against the layer grain but close no
// cycle — see the captionEditorSpecBase note.
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

// the merged interface self-types the spec-driven nested-editor fields — see
// the BaseAudioNode note
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseToggleNode extends NestedEditorFieldMap<typeof toggleNestedEditors> {}
export class BaseToggleNode extends generateDecoratorNode({
  nodeType: 'toggle',
  properties: toggleProperties,
  defaultRenderFn: renderToggleNode,
  importSpec: toggleImportSpec,
}) {
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
