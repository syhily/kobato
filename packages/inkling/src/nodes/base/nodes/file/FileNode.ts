import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

import {
  transientInitialFileProp,
  transientTriggerFileDialogProp,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { renderFileNode } from '@kobato/inkling-internal/nodes/base/nodes/file/file-renderer'
import { bytesToSize, sizeToBytes } from '@kobato/inkling-internal/nodes/base/utils/size-byte-converter'

export const fileTransientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

const fileProperties = [
  { name: 'src', default: '', urlType: 'url', redactDataUrl: true },
  { name: 'fileTitle', default: '', wordCount: true },
  { name: 'fileCaption', default: '', wordCount: true },
  { name: 'fileName', default: '' },
  { name: 'fileSize', default: 0 },
] as const satisfies readonly DecoratorNodeProperty[]

export const fileImportSpec = {
  conversions: [
    {
      tag: 'div',
      priority: 1,
      guardClass: 'inkling-file-card',
      reads: [
        { name: 'src', kind: 'attribute', attribute: 'href', selector: 'a', fallback: '' },
        { name: 'fileTitle', kind: 'text', selector: '.inkling-file-card-title', fallback: '' },
        { name: 'fileCaption', kind: 'text', selector: '.inkling-file-card-caption', fallback: '' },
        { name: 'fileName', kind: 'text', selector: '.inkling-file-card-filename', fallback: '' },
        { name: 'fileSize', kind: 'text', selector: '.inkling-file-card-filesize', fallback: '', parse: sizeToBytes },
      ],
    },
  ],
} satisfies CardImportSpec

export type FileData = DecoratorNodeData<typeof fileProperties>

export type SerializedFileNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof fileProperties>>

// oxlint-disable-next-line typescript/no-empty-object-type
export interface BaseFileNode extends CardSpecFieldMapFor<typeof fileTransientProps> {}
export class BaseFileNode extends generateDecoratorNode({
  nodeType: 'file',
  properties: fileProperties,
  defaultRenderFn: renderFileNode,
  importSpec: fileImportSpec,
}) {
  get formattedFileSize() {
    return bytesToSize(this.fileSize)
  }
}

export function $isFileNode(node: unknown): node is BaseFileNode {
  return node instanceof BaseFileNode
}

export const $createBaseFileNode = (dataset: FileData = {}) => {
  return new BaseFileNode(dataset)
}
