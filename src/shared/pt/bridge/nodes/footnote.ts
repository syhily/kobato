/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { BridgeReverseContext, PmBlockNode, PmNode } from '@/shared/pt/bridge/types'
import type { Block, FootnoteDefinitionBlock } from '@/shared/pt/schema'

import { isBlock } from '@/shared/pt/bridge/utils'

// PM↔PT converters for the `footnoteDefinition` node. The pure PT-tree
// renumbering engine lives in `@/shared/pt/footnote-sync` — nothing
// ProseMirror-shaped belongs there, and nothing PT-only belongs here.

export function footnoteDefinitionBlockToPmNode(
  block: FootnoteDefinitionBlock,
  pushBlocks: (out: PmNode[], blocks: readonly Block[]) => void,
): PmBlockNode {
  const inner: PmNode[] = []
  pushBlocks(inner, block.children)
  if (inner.length === 0) {
    inner.push({ type: 'paragraph' })
  }
  return {
    type: 'footnoteDefinition',
    attrs: { _key: block._key, index: block.index },
    content: inner,
  }
}

export function pmFootnoteDefinitionToBlocks(node: PmBlockNode, out: Block[], ctx: BridgeReverseContext): void {
  const inner: Block[] = []
  for (const child of (node.content ?? []).filter(isBlock)) {
    ctx.pushPmNode(inner, child)
  }
  const rawIndex = node.attrs?.index
  const idx = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : 1
  out.push({
    _type: 'footnoteDefinition',
    _key: ctx.ensureKey(node.attrs),
    index: idx >= 1 ? idx : 1,
    children: inner as FootnoteDefinitionBlock['children'],
  })
}
