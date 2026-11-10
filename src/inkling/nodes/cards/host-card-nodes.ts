import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce, type CardNodeClass } from '@/inkling/nodes/assemble-card-node'
import { getHostCards } from '@/inkling/nodes/cards/host-card-registry'

/**
 * The registered host cards' assembled node classes in registration order: the
 * node-set projection a host spreads into `<InklingComposer nodes>`. Classes come
 * from the memoized assembler (the exact object `defineCard` returned). The live
 * read lets host cards defined after module init still join, but the caller still
 * needs the card modules' imports for their `defineCard` side effects.
 */
export function getHostCardNodes(): CardNodeClass<LexicalNode>[] {
  return getHostCards().map((record) => assembleCardNodeOnce<LexicalNode>(record.spec))
}
