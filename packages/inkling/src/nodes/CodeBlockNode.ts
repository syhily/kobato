import type { CodeBlockNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { codeBlockDeclaration } from '@kobato/inkling-internal/nodes/cards/codeblock.declaration'
export { $isCodeBlockNode } from '@kobato/inkling-internal/nodes/base/nodes/codeblock/CodeBlockNode'
export type { SerializedCodeBlockNode } from '@kobato/inkling-internal/nodes/base/nodes/codeblock/CodeBlockNode'
export { INSERT_CODE_BLOCK_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { CodeBlockNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isCodeBlockNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createCodeBlockNode`
 * needs no cast.
 */
export const CodeBlockNode = assembleCardNodeOnce(codeBlockDeclaration)
export type CodeBlockNode = InstanceType<typeof CodeBlockNode>

export function $createCodeBlockNode(dataset: CodeBlockNodeDataset): CodeBlockNode {
  return new CodeBlockNode(dataset)
}
