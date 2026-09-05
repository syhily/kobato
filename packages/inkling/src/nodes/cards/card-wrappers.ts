import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { CARD_DECLARATIONS } from '@/nodes/cards'

/**
 * Wrapper-layer projection of the card declarations: each declaration paired
 * with the assembled node class that editor surfaces register. Every class is
 * assembled exactly once per declaration through the memoized
 * `assembleCardNodeOnce`, so the class registered here and the class the shim
 * modules (`@/nodes/AudioNode` and friends) re-export for their `$create*`
 * factories are the same object — importDOM/clone identity is coherent.
 * Being derived from `CARD_DECLARATIONS` keeps the projection exhaustive:
 * declaring a card automatically adds its assembly here. Kept out of the
 * declaration modules so they stay React-free — `@/nodes/base` derives its
 * own node set from the declarations, and importing wrappers there would
 * close an import cycle through the wrapper files.
 */
export const CARD_WRAPPER_NODES = CARD_DECLARATIONS.map((declaration) => ({
  ...declaration,
  // CARD_DECLARATIONS is a heterogeneous union, so the per-card node type can't
  // be inferred here — widen to the shared base; the shim call sites keep the
  // precise per-card class types
  node: assembleCardNodeOnce<LexicalNode>(declaration),
}))
