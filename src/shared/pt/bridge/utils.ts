import type { PmNode, PmInlineNode, PmBlockNode } from '@/shared/pt/bridge/types'

export function isInline(node: PmNode): node is PmInlineNode {
  return node.type === 'text'
}

export function isBlock(node: PmNode): node is PmBlockNode {
  return node.type !== 'text'
}

export function stringAttr(attrs: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!attrs) {
    return undefined
  }
  const value = attrs[key]
  return typeof value === 'string' ? value : undefined
}

export function numberAttr(attrs: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!attrs) {
    return undefined
  }
  const value = attrs[key]
  return typeof value === 'number' ? value : undefined
}

// FNV-1a 32-bit hash — plenty of collision resistance for the
// per-paragraph markDefs registry; base36 keeps `_key`s short and URL-safe.
export function hashLinkHref(href: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < href.length; i += 1) {
    hash ^= href.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}
