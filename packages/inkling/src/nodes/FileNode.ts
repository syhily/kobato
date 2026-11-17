import type { FileNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { fileDeclaration } from './cards/file.declaration'
export { $isFileNode } from './base/nodes/file/FileNode'
export type { SerializedFileNode } from './base/nodes/file/FileNode'
export { INSERT_FILE_COMMAND } from './cards/card-commands'
export type { FileNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isFileNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createFileNode`
 * needs no cast.
 */
export const FileNode = assembleCardNodeOnce(fileDeclaration)
export type FileNode = InstanceType<typeof FileNode>

export const $createFileNode = (dataset: FileNodeDataset): FileNode => {
  return new FileNode(dataset)
}
