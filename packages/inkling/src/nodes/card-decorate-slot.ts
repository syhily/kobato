import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

/**
 * The decorate() injection port — the one edge that keeps the assembled card
 * node classes React-free. Assembly (`@/nodes/assemble-card-node`) used to
 * statically import the shared decorate adapter (`@/nodes/decorate-card`),
 * which pulls the entire wrapper layer (InklingCardWrapper + every card
 * component) into ANY graph that touches a card shim — including the
 * markdown round-trip, and through it the `./headless` entry. Inverting the
 * edge (the wrapper layer registers here; assembly reads the slot) keeps the
 * headless conversion surface free of the React component tree.
 *
 * The wrapper layer (`@/nodes/decorate-card`) registers its adapter at module
 * scope, and the `.` barrel side-effect-imports that module — so every full
 * entry consumer has the slot filled before Lexical ever reconciles a card
 * node. Headless graphs never call decorate() (no React reconciliation), so
 * the empty-slot throw below is unreachable there; it exists to fail loudly
 * if a custom surface renders cards without the `.` entry's wiring.
 */

/** The shared decorate adapter's signature — see `@/nodes/decorate-card`. */
export type CardDecorateImpl = (node: LexicalNode) => ReactNode

let cardDecorateImpl: CardDecorateImpl | undefined

/** Called once, at module scope, by the wrapper layer (`@/nodes/decorate-card`). */
export function registerCardDecorate(impl: CardDecorateImpl): void {
  cardDecorateImpl = impl
}

/** The assembled classes' decorate() body — delegates to the registered adapter. */
export function decorateCardNode(node: LexicalNode): ReactNode {
  if (!cardDecorateImpl) {
    throw new Error(
      `[decorateCardNode] no decorate adapter registered — card nodes render only through the ` +
        `'@inkling/editor' entry (it side-effect-imports @/nodes/decorate-card); ` +
        `node type "${node.getType()}" reached decorate() without that wiring`,
    )
  }
  return cardDecorateImpl(node)
}
