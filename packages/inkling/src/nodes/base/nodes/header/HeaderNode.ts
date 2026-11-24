import type {
  DecoratorNodeProperty,
  NestedEditorFieldMap,
  NestedEditorSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { LexicalNode } from 'lexical'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { parseHeaderNode } from '@kobato/inkling-internal/nodes/base/nodes/header/parsers/header-parser'
import { renderHeaderNodeV2 } from '@kobato/inkling-internal/nodes/base/nodes/header/renderers/header-renderer'
import { normalizeCardWidth, type CardWidth } from '@kobato/inkling-internal/nodes/base/utils/card-widths'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import { $canShowPlaceholderCurry } from '@lexical/text'

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

export const headerCardWidth = (node: LexicalNode): CardWidth | undefined => {
  const layout = $isHeaderNode(node) ? node.layout : undefined
  return normalizeCardWidth(layout === 'split' ? 'full' : layout)
}

// oxlint-disable-next-line typescript/no-empty-object-type
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

  isEmpty() {
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
