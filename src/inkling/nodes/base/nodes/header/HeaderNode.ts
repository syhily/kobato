import type { LexicalNode } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

import type { DecoratorNodeProperty, NestedEditorFieldMap, NestedEditorSpec } from '@/inkling/nodes/base/card-specs'

import { generateDecoratorNode, type DecoratorNodeData } from '@/inkling/nodes/base/generate-decorator-node'
import { parseHeaderNode } from '@/inkling/nodes/base/nodes/header/parsers/header-parser'
import { renderHeaderNodeV2 } from '@/inkling/nodes/base/nodes/header/renderers/header-renderer'
import { normalizeCardWidth, type CardWidth } from '@/inkling/nodes/base/utils/card-widths'
import MINIMAL_NODES from '@/inkling/nodes/MinimalNodes'

// The card's nested-editor spec (CONTEXT.md: "card spec") lives here, beside
// the class it types — the declaration imports it from this module. Header's
// dataset exposes the editors but not their initial states
// (`exposeInitialStateInDataset: false`). The MINIMAL_NODES import runs
// against the layer grain but closes no cycle — see the
// captionEditorSpecBase note.
export const headerNestedEditors = [
  {
    name: 'headerTextEditor',
    serializedKey: 'header',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { firstChildInnerContent: true, allowBr: true },
    exposeInitialStateInDataset: false,
  },
  {
    name: 'subheaderTextEditor',
    serializedKey: 'subheader',
    nodes: MINIMAL_NODES,
    cleanBasicHtml: { firstChildInnerContent: true, allowBr: true },
    exposeInitialStateInDataset: false,
  },
] as const satisfies readonly NestedEditorSpec[]

const headerProperties = [
  { name: 'size', default: 'small' },
  { name: 'style', default: 'dark' },
  { name: 'buttonEnabled', default: false },
  { name: 'buttonUrl', default: '', urlType: 'url' },
  { name: 'buttonText', default: '' },
  { name: 'header', default: '', urlType: 'html', wordCount: true },
  { name: 'subheader', default: '', urlType: 'html', wordCount: true },
  { name: 'backgroundImageSrc', default: '', urlType: 'url' },
  { name: 'version', default: 2 },
  { name: 'accentColor', default: '#FF1A75' },
  { name: 'alignment', default: 'center' },
  { name: 'backgroundColor', default: '#000000' },
  { name: 'backgroundImageWidth', default: null as number | null },
  { name: 'backgroundImageHeight', default: null as number | null },
  { name: 'backgroundSize', default: 'cover' },
  { name: 'textColor', default: '#FFFFFF' },
  { name: 'buttonColor', default: '#ffffff' },
  { name: 'buttonTextColor', default: '#000000' },
  { name: 'layout', default: 'full' },
  { name: 'swapped', default: false },
] as const satisfies readonly DecoratorNodeProperty[]

export type HeaderData = DecoratorNodeData<typeof headerProperties>

/**
 * Header's layout→width mapping: a `split` layout renders at `full` width,
 * every other layout is itself the card width (or undefined when the layout
 * is not a valid width). The node's `getCardWidth()` and the declaration's
 * decorate-target width both delegate to this one mapper. Kept on the base
 * module: the declaration imports it from here, so the base node never
 * imports its declaration (no import cycle).
 */
export const headerCardWidth = (node: LexicalNode): CardWidth | undefined => {
  const layout = $isHeaderNode(node) ? node.layout : undefined
  return normalizeCardWidth(layout === 'split' ? 'full' : layout)
}

// the merged interface self-types the spec-driven nested-editor fields — see
// the BaseAudioNode note
// oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
export interface BaseHeaderNode extends NestedEditorFieldMap<typeof headerNestedEditors> {}
export class BaseHeaderNode extends generateDecoratorNode({
  nodeType: 'header',
  properties: headerProperties,
  defaultRenderFn: renderHeaderNodeV2,
}) {
  static importDOM() {
    return parseHeaderNode(this)
  }

  getCardWidth(): CardWidth | undefined {
    return headerCardWidth(this)
  }

  // override the default `isEmpty` check because we need to check the nested editors
  // rather than the data properties themselves
  isEmpty() {
    // Unset on spec-less base instances — guard so the field type stays
    // honest (the BaseToggleNode.isEmpty idiom). A header without editors is
    // never auto-removed.
    if (!this.__headerTextEditor || !this.__subheaderTextEditor) {
      return false
    }
    const isHtmlEmpty = this.__headerTextEditor.getEditorState().read($canShowPlaceholderCurry(false))
    const isSubHtmlEmpty = this.__subheaderTextEditor.getEditorState().read($canShowPlaceholderCurry(false))
    return (
      isHtmlEmpty &&
      isSubHtmlEmpty &&
      (!this.buttonEnabled || (!this.buttonText && !this.buttonUrl)) &&
      !this.backgroundImageSrc
    )
  }
}

export const $createBaseHeaderNode = (dataset: HeaderData = {}) => {
  return new BaseHeaderNode(dataset)
}

export function $isHeaderNode(node: unknown): node is BaseHeaderNode {
  return node instanceof BaseHeaderNode
}
