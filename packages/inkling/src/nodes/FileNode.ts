import type { FileNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { fileDeclaration } from '@kobato/inkling-internal/nodes/cards/file.declaration'
export { $isFileNode } from '@kobato/inkling-internal/nodes/base/nodes/file/FileNode'
export type { SerializedFileNode } from '@kobato/inkling-internal/nodes/base/nodes/file/FileNode'
export { INSERT_FILE_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { FileNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

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
