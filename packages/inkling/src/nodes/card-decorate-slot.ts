import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

export type CardDecorateImpl = (node: LexicalNode) => ReactNode

let cardDecorateImpl: CardDecorateImpl | undefined

export function registerCardDecorate(impl: CardDecorateImpl): void {
  cardDecorateImpl = impl
}

export function decorateCardNode(node: LexicalNode): ReactNode {
  if (!cardDecorateImpl) {
    throw new Error(
      `[decorateCardNode] no decorate adapter registered — card nodes render only behind an entry that calls ` +
        `registerCardDecorateAdapter() at module top level (the React barrel and the comment composer do); ` +
        `node type "${node.getType()}" reached decorate() without that wiring`,
    )
  }
  return cardDecorateImpl(node)
}
