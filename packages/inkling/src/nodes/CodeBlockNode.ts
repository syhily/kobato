import type { CodeBlockNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { codeBlockDeclaration } from './cards/codeblock.declaration'
export { $isCodeBlockNode } from './base/nodes/codeblock/CodeBlockNode'
export type { SerializedCodeBlockNode } from './base/nodes/codeblock/CodeBlockNode'
export { INSERT_CODE_BLOCK_COMMAND } from './cards/card-commands'
export type { CodeBlockNodeDataset } from './cards/card-commands'

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
