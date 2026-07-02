import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseHeaderNode } from '@/ui/inkling-editor/nodes/base/nodes/header/parsers/header-parser'
import { renderHeaderNodeV2 } from '@/ui/inkling-editor/nodes/base/nodes/header/renderers/v2/header-renderer'

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

export interface HeaderNode extends DecoratorNodeValueMap<typeof headerProperties> {}

export class HeaderNode extends generateDecoratorNode({
  nodeType: 'header',
  properties: headerProperties,
  defaultRenderFn: {
    2: renderHeaderNodeV2,
  },
}) {
  static importDOM() {
    return parseHeaderNode(this)
  }
}

export const $createHeaderNode = (dataset: HeaderData = {}) => {
  return new HeaderNode(dataset)
}

export function $isHeaderNode(node: unknown): node is HeaderNode {
  return node instanceof HeaderNode
}
