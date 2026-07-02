import {
  generateDecoratorNode,
  type DecoratorNodeData,
  type DecoratorNodeProperty,
  type DecoratorNodeValueMap,
} from '@/ui/inkling-editor/nodes/base/generate-decorator-node'
import { parseFileNode } from '@/ui/inkling-editor/nodes/base/nodes/file/file-parser'
import { renderFileNode } from '@/ui/inkling-editor/nodes/base/nodes/file/file-renderer'
import { bytesToSize } from '@/ui/inkling-editor/nodes/base/utils/size-byte-converter'

const fileProperties = [
  { name: 'src', default: '', urlType: 'url' },
  { name: 'fileTitle', default: '', wordCount: true },
  { name: 'fileCaption', default: '', wordCount: true },
  { name: 'fileName', default: '' },
  { name: 'fileSize', default: 0 },
] as const satisfies readonly DecoratorNodeProperty[]

export type FileData = DecoratorNodeData<typeof fileProperties>

export interface FileNode extends DecoratorNodeValueMap<typeof fileProperties> {}

export class FileNode extends generateDecoratorNode({
  nodeType: 'file',
  properties: fileProperties,
  defaultRenderFn: renderFileNode,
}) {
  /* @override */
  exportJSON() {
    const { src, fileTitle, fileCaption, fileName, fileSize } = this
    const isBlob = src && src.startsWith('data:')

    return {
      type: 'file' as const,
      version: 1,
      src: isBlob ? '<base64String>' : src,
      fileTitle,
      fileCaption,
      fileName,
      fileSize,
    }
  }

  static importDOM() {
    return parseFileNode(this)
  }

  get formattedFileSize() {
    return bytesToSize(this.fileSize)
  }
}

export function $isFileNode(node: unknown): node is FileNode {
  return node instanceof FileNode
}

export const $createFileNode = (dataset: FileData = {}) => {
  return new FileNode(dataset)
}
