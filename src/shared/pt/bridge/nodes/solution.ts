/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { BridgeReverseContext, PmBlockNode, PmNode } from '@/shared/pt/bridge/types'
import type { Block, SolutionBlock } from '@/shared/pt/schema'

import { isBlock } from '@/shared/pt/bridge/utils'

export function solutionBlockToPmNode(
  block: SolutionBlock,
  pushBlocks: (out: PmNode[], blocks: readonly Block[]) => void,
): PmBlockNode {
  const inner: PmNode[] = []
  pushBlocks(inner, block.children)
  if (inner.length === 0) {
    inner.push({ type: 'paragraph' })
  }
  return {
    type: 'solution',
    attrs: { _key: block._key },
    content: inner,
  }
}

export function pmSolutionToBlocks(node: PmBlockNode, out: Block[], ctx: BridgeReverseContext): void {
  const inner: Block[] = []
  for (const child of (node.content ?? []).filter(isBlock)) {
    ctx.pushPmNode(inner, child)
  }
  out.push({
    _type: 'solution',
    _key: ctx.ensureKey(node.attrs),
    children: inner as SolutionBlock['children'],
  })
}
