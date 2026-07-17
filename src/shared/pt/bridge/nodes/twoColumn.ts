/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { BridgeReverseContext, PmBlockNode, PmNode } from '@/shared/pt/bridge/types'
import type { Block, TwoColumnBlock } from '@/shared/pt/schema'

import { isBlock, stringAttr } from '@/shared/pt/bridge/utils'

export function twoColumnBlockToPmNode(
  block: TwoColumnBlock,
  pushBlocks: (out: PmNode[], blocks: readonly Block[]) => void,
): PmBlockNode {
  const leftInner: PmNode[] = []
  const rightInner: PmNode[] = []
  pushBlocks(leftInner, block.left)
  pushBlocks(rightInner, block.right)
  if (leftInner.length === 0) {
    leftInner.push({ type: 'paragraph' })
  }
  if (rightInner.length === 0) {
    rightInner.push({ type: 'paragraph' })
  }
  const baseKey = block._key
  return {
    type: 'twoColumn',
    attrs: { _key: baseKey },
    content: [
      {
        type: 'twoColumnPane',
        attrs: { _key: `${baseKey}-pane-L`, side: 'left' },
        content: leftInner,
      },
      {
        type: 'twoColumnPane',
        attrs: { _key: `${baseKey}-pane-R`, side: 'right' },
        content: rightInner,
      },
    ],
  }
}

export function pmTwoColumnToBlocks(node: PmBlockNode, out: Block[], ctx: BridgeReverseContext): void {
  const panes = (node.content ?? []).filter(isBlock).filter((c) => c.type === 'twoColumnPane')
  const pickPane = (side: 'left' | 'right'): PmBlockNode | undefined => {
    const byAttr = panes.find((p) => stringAttr(p.attrs, 'side') === side)
    return byAttr ?? (side === 'left' ? panes[0] : panes[1])
  }
  const leftPane = pickPane('left')
  const rightPane = pickPane('right')
  const leftBlocks: Block[] = []
  const rightBlocks: Block[] = []
  const collectPane = (pane: PmBlockNode | undefined, target: Block[]): void => {
    if (pane === undefined) {
      return
    }
    for (const child of (pane.content ?? []).filter(isBlock)) {
      ctx.pushPmNode(target, child)
    }
  }
  collectPane(leftPane, leftBlocks)
  collectPane(rightPane, rightBlocks)
  out.push({
    _type: 'twoColumn',
    _key: ctx.ensureKey(node.attrs),
    left: leftBlocks as TwoColumnBlock['left'],
    right: rightBlocks as TwoColumnBlock['right'],
  })
}
