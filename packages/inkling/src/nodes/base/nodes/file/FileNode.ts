import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'
import type { CardImportSpec } from '@/nodes/base/import-spec'

import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeValueMap,
  type SerializedGeneratedDecoratorNode,
} from '@/nodes/base/generate-decorator-node'
import { renderFileNode } from '@/nodes/base/nodes/file/file-renderer'
import { bytesToSize, sizeToBytes } from '@/nodes/base/utils/size-byte-converter'

const fileProperties = [
  // the blob guard as spec data: an upload-in-progress data-string src must
  // not be persisted (the generated exportJSON redacts it)
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
        // sizeToBytes('') is 0 — the property default — so a missing size
        // element still writes the key
        { name: 'fileSize', kind: 'text', selector: '.inkling-file-card-filesize', fallback: '', parse: sizeToBytes },
      ],
    },
  ],
} satisfies CardImportSpec

export type FileData = DecoratorNodeData<typeof fileProperties>

export type SerializedFileNode = SerializedGeneratedDecoratorNode<DecoratorNodeValueMap<typeof fileProperties>>

export interface BaseFileNode extends DecoratorNodeValueMap<typeof fileProperties> {}

export class BaseFileNode extends generateDecoratorNode({
  nodeType: 'file',
  properties: fileProperties,
  defaultRenderFn: renderFileNode,
  importSpec: fileImportSpec,
}) {
  // The transient-prop spec (file.declaration.ts) initializes this only on
  // spec-adopting assembled classes — the accessor is assembly-defined from
  // the spec (the `declare` leg is type-only, so base-typed write-seam
  // consumers can name it); a raw `new BaseFileNode()` leaves the field
  // unset, so `undefined` is part of the honest type for spec-less instances
  declare __triggerFileDialog: boolean | undefined
  declare triggerFileDialog: boolean | undefined

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
