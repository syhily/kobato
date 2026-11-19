import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce, type CardNodeClass } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { getHostCards } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

export function getHostCardNodes(): CardNodeClass<LexicalNode>[] {
  return getHostCards().map((record) => assembleCardNodeOnce<LexicalNode>(record.spec))
}
