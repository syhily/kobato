import type { FileNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { fileDeclaration } from '@/inkling/nodes/cards/file.declaration'
export { $isFileNode } from '@/inkling/nodes/base/nodes/file/FileNode'
export type { SerializedFileNode } from '@/inkling/nodes/base/nodes/file/FileNode'
export { INSERT_FILE_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { FileNodeDataset } from '@/inkling/nodes/cards/card-commands'

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
