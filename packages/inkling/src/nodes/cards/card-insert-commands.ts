import type { CardInsertSpec } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { AnyLexicalCommand, Klass, LexicalNode } from 'lexical'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { resolveCardInsertCommand } from '@kobato/inkling-internal/nodes/cards/card-commands'
import { resolveAllCardFacts } from '@kobato/inkling-internal/nodes/cards/card-facts'
import { CARD_WRAPPER_NODES } from '@kobato/inkling-internal/nodes/cards/card-wrappers'

export interface CardInsertRegistration {
  nodeType: string
  node: Klass<LexicalNode>
  command: AnyLexicalCommand
  insert: CardInsertSpec
  pickerAutoOpen?: boolean
}
export const CARD_INSERT_COMMANDS: CardInsertRegistration[] = CARD_WRAPPER_NODES.flatMap((declaration) => {
  const insert: CardInsertSpec | undefined = 'insert' in declaration ? declaration.insert : undefined
  if (insert === undefined) {
    return []
  }
  return [
    {
      nodeType: declaration.nodeType,
      node: declaration.node,
      command: resolveCardInsertCommand(declaration.nodeType),
      insert,
    },
  ]
})

const CARD_INSERT_COMMANDS_BY_TYPE = new Map(
  CARD_INSERT_COMMANDS.map((registration) => [registration.nodeType, registration]),
)

export function getCardInsertRegistrations(): CardInsertRegistration[] {
  return resolveAllCardFacts().flatMap((facts) => {
    if (facts.source === 'builtin') {
      const registration = CARD_INSERT_COMMANDS_BY_TYPE.get(facts.nodeType)
      return registration === undefined ? [] : [registration]
    }
    const insert = facts.host.spec.insert
    if (insert === undefined) {
      return []
    }
    return [
      {
        nodeType: facts.nodeType,
        node: assembleCardNodeOnce<LexicalNode>(facts.host.spec),
        command: resolveCardInsertCommand(facts.nodeType),
        insert,
        pickerAutoOpen: facts.host.spec.picker?.autoOpenOnInsert === true,
      },
    ]
  })
}
