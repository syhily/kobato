import type { Block } from '@/shared/pt/schema'

export interface PmDoc {
  type: 'doc'
  content: PmNode[]
}

export type PmNode = PmBlockNode | PmInlineNode | PmHardBreakNode

export interface PmBlockNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  marks?: PmMark[]
}

export interface PmInlineNode {
  type: 'text'
  text: string
  marks?: PmMark[]
}

/** Shift+Enter line break inside paragraph-ish content (`<br>` in HTML). */
export interface PmHardBreakNode {
  type: 'hardBreak'
  marks?: PmMark[]
}

export interface PmMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PmListNode extends PmBlockNode {
  type: 'bulletList' | 'orderedList'
  content: PmNode[]
}

/** Regenerate-or-keep `_key` policy shared by every PM→PT converter. */
export type BridgeEnsureKey = (attrs: Record<string, unknown> | undefined) => string

/**
 * Recursion handles passed to the registry's container converters so node
 * modules never import the dispatch table itself (which would be an import
 * cycle: the registry imports the node modules).
 */
export interface BridgeReverseContext {
  ensureKey: BridgeEnsureKey
  pushPmNode: (out: Block[], node: PmNode) => void
}

export interface BridgeForwardContext {
  pushBlocks: (out: PmNode[], blocks: readonly Block[]) => void
}
