import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce, type CardNodeClass } from '@/inkling/nodes/assemble-card-node'
import { getHostCards } from '@/inkling/nodes/cards/host-card-registry'

/**
 * The registered host cards' assembled node classes, in registration order
 * (CONTEXT.md: "host card") — the node-set projection a host composes into
 * `<InklingComposer nodes>` instead of hand-spreading each `card.node`
 * handle. Each class comes from the memoized assembler, so the projection
 * returns the exact class object `defineCard` returned on the handle. A live
 * read (a function, not a constant — the `getCardInsertRegistrations`
 * idiom): host cards defined after this module's init still join, and the
 * caller still needs the card modules' own imports for the `defineCard`
 * side effects to have run.
 */
export function getHostCardNodes(): CardNodeClass<LexicalNode>[] {
  return getHostCards().map((record) => assembleCardNodeOnce<LexicalNode>(record.spec))
}
