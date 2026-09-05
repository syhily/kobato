import type { FileNodeDataset } from '@/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { fileDeclaration } from '@/nodes/cards/file.declaration'
export { $isFileNode } from '@/nodes/base/nodes/file/FileNode'
export type { SerializedFileNode } from '@/nodes/base/nodes/file/FileNode'
export { INSERT_FILE_COMMAND } from '@/nodes/cards/card-commands'
export type { FileNodeDataset } from '@/nodes/cards/card-commands'

/**
 * The registered class is assembled from the card declaration, and
 * `$isFileNode` is canonical on the base node. The instance type carries
 * the spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so `$createFileNode`
 * constructs the assembled class — which initializes the transient-prop
 * spec — with no cast.
 */
export const FileNode = assembleCardNodeOnce(fileDeclaration)
export type FileNode = InstanceType<typeof FileNode>

export const $createFileNode = (dataset: FileNodeDataset): FileNode => {
  // the transient fields are initialized by the constructor from the dataset
  return new FileNode(dataset)
}
