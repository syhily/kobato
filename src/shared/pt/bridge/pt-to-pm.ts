import type { PmDoc, PmNode } from '@/shared/pt/bridge/types'
import type { Block, PortableTextBody } from '@/shared/pt/schema'

import { dispatchBlockToPm } from '@/shared/pt/bridge/node-registry'
import { consumeListStreak } from '@/shared/pt/bridge/nodes/list'
import { validatePortableTextBody } from '@/shared/pt/utils'

/**
 * Validate and convert untyped input into a ProseMirror `doc` node.
 * Use at editor mount when loading historical data; raw `bodyToPmDoc`
 * skips schema validation for hot-path round-trips.
 */
export function parsePortableTextBodyForEditor(input: unknown): PmDoc {
  return bodyToPmDoc(validatePortableTextBody(input))
}

/** Convert a PortableText body into a ProseMirror `doc` node. */
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
  // PortableText represents lists as a flat sequence of `block`s tagged
  // with `listItem` + `level`. ProseMirror needs nested list trees.
  // The state machine scans consecutive list items and emits a single
  // root list node per "streak" with deeper levels nested inside the
  // previous level's last `<li>`.
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
