import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { CARD_DECLARATIONS } from '@/inkling/nodes/cards'

/**
 * Wrapper-layer projection of the card declarations: each declaration paired with the
 * assembled node class editor surfaces register. Classes come from the memoized
 * `assembleCardNodeOnce`, so the class registered here and the class the shims
 * (`@/inkling/nodes/AudioNode` and friends) re-export are the same object and
 * importDOM/clone identity stays coherent. Kept out of the declaration modules so
 * those stay React-free; importing wrappers there would close an import cycle.
 */
export const CARD_WRAPPER_NODES = CARD_DECLARATIONS.map((declaration) =>
  // Fresh object: the added `node` key must never mutate the shared declaration.
  // CARD_DECLARATIONS is a heterogeneous union, so the per-card node type cannot be
  // inferred here; widen to the shared base (shim call sites keep the precise types).
  Object.assign({}, declaration, { node: assembleCardNodeOnce<LexicalNode>(declaration) }),
)
