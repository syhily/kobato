import type { BridgeEnsureKey, PmBlockNode, PmInlineNode } from '@/shared/pt/bridge/types'
import type { CodeBlock } from '@/shared/pt/schema'

import { isInline, stringAttr } from '@/shared/pt/bridge/utils'

export function codeBlockToPmNode(block: CodeBlock): PmBlockNode {
  return {
    type: 'codeBlock',
    attrs: { _key: block._key, language: block.language, highlightedHtml: block.highlightedHtml },
    content: block.code === '' ? undefined : [{ type: 'text', text: block.code }],
  }
}

export function pmCodeBlockToBlock(node: PmBlockNode, ensureKey: BridgeEnsureKey): CodeBlock {
  const code = (node.content ?? [])
    .filter((child): child is PmInlineNode => isInline(child))
    .map((child) => child.text)
    .join('')
  return {
    _type: 'code',
    _key: ensureKey(node.attrs),
    code,
    language: stringAttr(node.attrs, 'language'),
    highlightedHtml: stringAttr(node.attrs, 'highlightedHtml'),
  }
}
