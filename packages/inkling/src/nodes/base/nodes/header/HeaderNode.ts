import type { LexicalEditor, LexicalNode } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
} from '@/nodes/base/generate-decorator-node'
import { parseHeaderNode } from '@/nodes/base/nodes/header/parsers/header-parser'
import { renderHeaderNodeV2 } from '@/nodes/base/nodes/header/renderers/header-renderer'
import { normalizeCardWidth, type CardWidth } from '@/nodes/base/utils/card-widths'

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

export interface BaseHeaderNode extends DecoratorNodeValueMap<typeof headerProperties> {}

/**
 * Header's layout→width mapping: a `split` layout renders at `full` width,
 * every other layout is itself the card width (or undefined when the layout
 * is not a valid width). The node's `getCardWidth()` and the declaration's
 * decorate-target width both delegate to this one mapper. Kept on the base
 * module: the declaration imports it from here, so the base node never
 * imports its declaration (no import cycle).
 */
export const headerCardWidth = (node: LexicalNode): CardWidth | undefined => {
  const layout = (node as BaseHeaderNode).layout
  return normalizeCardWidth(layout === 'split' ? 'full' : layout)
}

export class BaseHeaderNode extends generateDecoratorNode({
  nodeType: 'header',
  properties: headerProperties,
  defaultRenderFn: renderHeaderNodeV2,
}) {
  // The generated constructor assigns the nested editors only on subclasses
  // that adopt a `nestedEditors` spec (the assembled card class); a raw
  // `new BaseHeaderNode()` leaves them unset — `undefined` is part of the
  // honest type here (the CodeBlockNode.__openInEditMode idiom).
  declare __headerTextEditor: LexicalEditor | null | undefined
  declare __subheaderTextEditor: LexicalEditor | null | undefined

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
