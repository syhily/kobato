import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

/**
 * The decorate() injection port — the one edge that keeps the assembled card node
 * classes React-free: the wrapper layer (`@/inkling/nodes/decorate-card`) registers
 * here, and assembly (`@/inkling/nodes/assemble-card-node`) reads the slot. A static
 * import of the adapter from assembly would pull the entire wrapper layer
 * (InklingCardWrapper + every card component) into any graph that touches a card
 * shim — including the markdown round-trip and, through it, the `@/inkling/headless`
 * surface. Headless graphs never call decorate() (no React reconciliation), so the
 * empty-slot throw is unreachable there; it fails loudly if a custom surface renders
 * cards without the barrel's wiring.
 */

/** The shared decorate adapter's signature — see `@/inkling/nodes/decorate-card`. */
export type CardDecorateImpl = (node: LexicalNode) => ReactNode

let cardDecorateImpl: CardDecorateImpl | undefined

/** Called once by the wrapper layer's `registerCardDecorateAdapter()` (`@/inkling/nodes/decorate-card`). */
export function registerCardDecorate(impl: CardDecorateImpl): void {
  cardDecorateImpl = impl
}

/** The assembled classes' decorate() body — delegates to the registered adapter. */
export function decorateCardNode(node: LexicalNode): ReactNode {
  if (!cardDecorateImpl) {
    throw new Error(
      `[decorateCardNode] no decorate adapter registered — card nodes render only through the ` +
        `'@/inkling' barrel (it calls registerCardDecorateAdapter() at module top level); ` +
        `node type "${node.getType()}" reached decorate() without that wiring`,
    )
  }
  return cardDecorateImpl(node)
}
