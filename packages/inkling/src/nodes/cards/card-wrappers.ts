import type { LexicalNode } from 'lexical'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { CARD_DECLARATIONS } from '@kobato/inkling-internal/nodes/cards/'

export const CARD_WRAPPER_NODES = CARD_DECLARATIONS.map((declaration) =>
  Object.assign({}, declaration, { node: assembleCardNodeOnce<LexicalNode>(declaration) }),
)
