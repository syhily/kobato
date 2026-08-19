import type { PmDoc, PmNode } from '@/shared/pt/bridge/types'
import type { Block, PortableTextBody } from '@/shared/pt/schema'

import { dispatchBlockToPm } from '@/shared/pt/bridge/node-registry'
import { consumeListStreak } from '@/shared/pt/bridge/nodes/list'

export function bodyToPmDoc(body: PortableTextBody): PmDoc {
  const content: PmNode[] = []
  pushBlocks(content, body)
  // ProseMirror's `doc` schema disallows an empty body.
  if (content.length === 0) {
    content.push({ type: 'paragraph' })
  }
  return { type: 'doc', content }
}

export function pushBlocks(out: PmNode[], blocks: readonly Block[]): void {
  // PortableText lists are flat `listItem` + `level` blocks; the state
  // machine emits one root list node per streak, nesting deeper levels.
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (block._type === 'block' && block.listItem !== undefined) {
      const consumed = consumeListStreak(out, blocks, i)
      i += consumed
      continue
    }
    out.push(dispatchBlockToPm(block, { pushBlocks }))
    i += 1
  }
}
