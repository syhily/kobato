import type { PmBlockNode, PmNode } from '@/shared/pt/bridge/types'
import type { Block, SolutionBlock } from '@/shared/pt/schema'

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
