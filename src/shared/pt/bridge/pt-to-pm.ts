import type { PmDoc, PmNode, PmBlockNode } from '@/shared/pt/bridge/types'
import type { Block, PortableTextBody } from '@/shared/pt/schema'

import { codeBlockToPmNode } from '@/shared/pt/bridge/nodes/code'
import { footnoteDefinitionBlockToPmNode } from '@/shared/pt/bridge/nodes/footnote'
import { horizontalRuleBlockToPmNode } from '@/shared/pt/bridge/nodes/horizontalRule'
import { imageBlockToPmNode } from '@/shared/pt/bridge/nodes/image'
import { consumeListStreak } from '@/shared/pt/bridge/nodes/list'
import { mathBlockToPmNode } from '@/shared/pt/bridge/nodes/math'
import { musicPlayerBlockToPmNode } from '@/shared/pt/bridge/nodes/musicPlayer'
import { solutionBlockToPmNode } from '@/shared/pt/bridge/nodes/solution'
import { tableBlockToPmNode } from '@/shared/pt/bridge/nodes/table'
import { textBlockToPmNode } from '@/shared/pt/bridge/nodes/text'
import { twoColumnBlockToPmNode } from '@/shared/pt/bridge/nodes/twoColumn'
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
    out.push(blockToPmNode(block))
    i += 1
  }
}

function blockToPmNode(block: Block): PmBlockNode {
  switch (block._type) {
    case 'block':
      return textBlockToPmNode(block, false)
    case 'image':
      return imageBlockToPmNode(block)
    case 'code':
      return codeBlockToPmNode(block)
    case 'horizontalRule':
      return horizontalRuleBlockToPmNode(block)
    case 'table':
      return tableBlockToPmNode(block)
    case 'solution':
      return solutionBlockToPmNode(block, pushBlocks)
    case 'twoColumn':
      return twoColumnBlockToPmNode(block, pushBlocks)
    case 'footnoteDefinition':
      return footnoteDefinitionBlockToPmNode(block, pushBlocks)
    case 'mathBlock':
      return mathBlockToPmNode(block)
    case 'musicPlayer':
      return musicPlayerBlockToPmNode(block)
    default:
      return customBlockToPmNode(block)
  }
}

function customBlockToPmNode(block: Block): PmBlockNode {
  // Pass-through node. Tiptap renders these with a generic
  // "block-card" view that reads `attrs.payload`.
  return {
    type: 'blockCard',
    attrs: { _key: block._key, _ptType: block._type, payload: block },
  }
}
