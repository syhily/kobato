import type { CodeBlockNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { codeBlockDeclaration } from '@/inkling/nodes/cards/codeblock.declaration'
export { $isCodeBlockNode } from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
export type { SerializedCodeBlockNode } from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
export { INSERT_CODE_BLOCK_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { CodeBlockNodeDataset } from '@/inkling/nodes/cards/card-commands'

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
