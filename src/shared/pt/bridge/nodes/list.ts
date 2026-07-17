import type { PmNode, PmListNode, PmBlockNode } from '@/shared/pt/bridge/types'
import type { Block } from '@/shared/pt/schema'

import { paragraphToTextBlock, textBlockToPmNode } from '@/shared/pt/bridge/nodes/text'

export function consumeListStreak(out: PmNode[], blocks: readonly Block[], start: number): number {
  const first = blocks[start]
  if (first._type !== 'block' || first.listItem === undefined) {
    throw new Error('consumeListStreak called with non-list block')
  }
  const rootKind: 'bullet' | 'number' = first.listItem === 'bullet' ? 'bullet' : 'number'
  const root: PmListNode = {
    type: rootKind === 'bullet' ? 'bulletList' : 'orderedList',
    content: [],
  }
  const stack: PmListNode[] = [root]
  let i = start
  while (i < blocks.length) {
    const block = blocks[i]
    if (block._type !== 'block' || block.listItem === undefined) {
      break
    }
    const kind: 'bullet' | 'number' = block.listItem === 'bullet' ? 'bullet' : 'number'
    const level = Math.max(1, block.level ?? 1)
    if (level === 1 && kind !== rootKind) {
      break
    }
    while (stack.length > level) {
      stack.pop()
    }
    while (stack.length < level) {
      const parentList = stack[stack.length - 1]
      let parentItem = parentList.content[parentList.content.length - 1] as PmBlockNode | undefined
      if (parentItem === undefined || parentItem.type !== 'listItem') {
        parentItem = { type: 'listItem', content: [{ type: 'paragraph' }] }
        parentList.content.push(parentItem)
      }
      const subKind: 'bullet' | 'number' = level === stack.length + 1 ? kind : 'bullet'
      const sub: PmListNode = {
        type: subKind === 'bullet' ? 'bulletList' : 'orderedList',
        content: [],
      }
      parentItem.content = [...(parentItem.content ?? []), sub]
      stack.push(sub)
    }
    const target = stack[stack.length - 1]
    const wanted = kind === 'bullet' ? 'bulletList' : 'orderedList'
    if (target.type !== wanted) {
      break
    }
    target.content.push({
      type: 'listItem',
      content: [textBlockToPmNode(block, /* asListItemChild */ true)],
    })
    i += 1
  }
  out.push(root)
  return i - start
}

export function flattenList(
  node: PmBlockNode,
  out: Block[],
  ensureKey: (attrs: Record<string, unknown> | undefined) => string,
  level: number,
): void {
  const kind: 'bullet' | 'number' = node.type === 'bulletList' ? 'bullet' : 'number'
  const items = (node.content ?? []).filter(isBlock).filter((c) => c.type === 'listItem')
  for (const item of items) {
    const itemContent = (item.content ?? []).filter(isBlock)
    for (const child of itemContent) {
      if (child.type === 'paragraph') {
        out.push({
          ...paragraphToTextBlock(child, ensureKey, 'normal'),
          listItem: kind,
          level,
        })
        continue
      }
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        flattenList(child, out, ensureKey, level + 1)
        continue
      }
      // Loud failure: a listItem child we cannot represent (e.g. a code
      // block) used to be silently dropped on save.
      throw new Error(
        `pt-bridge: cannot save — no converter registered for listItem child PM node type "${child.type}"`,
      )
    }
  }
}

function isBlock(node: PmNode): node is PmBlockNode {
  return node.type !== 'text'
}
