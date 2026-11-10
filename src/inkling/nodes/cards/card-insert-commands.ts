import type { AnyLexicalCommand, Klass, LexicalNode } from 'lexical'

import type { CardInsertSpec } from '@/inkling/nodes/cards/card-declaration'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { resolveCardInsertCommand } from '@/inkling/nodes/cards/card-commands'
import { resolveAllCardFacts } from '@/inkling/nodes/cards/card-facts'
import { CARD_WRAPPER_NODES } from '@/inkling/nodes/cards/card-wrappers'

export interface CardInsertRegistration {
  nodeType: string
  node: Klass<LexicalNode>
  command: AnyLexicalCommand
  insert: CardInsertSpec
  /**
   * Host cards whose picker spec carries `autoOpenOnInsert`: the registrar opens
   * the picker on the freshly inserted node. Built-in entries never carry it —
   * pickers are host-only.
   */
  pickerAutoOpen?: boolean
}

/**
 * Wrapper-layer projection of the card declarations: each insert-bearing declaration
 * paired with the wrapper node class the registration constructs and the card's
 * insert command, derived from its node type by `resolveCardInsertCommand` (the
 * insert spec carries only flags, never a command object). Kept out of the
 * declaration modules so they stay React-free; the registrar
 * (`@/inkling/plugins/CardInsertPlugin`) is the derived view over this list.
 */
export const CARD_INSERT_COMMANDS: CardInsertRegistration[] = CARD_WRAPPER_NODES.flatMap((declaration) => {
  // `in` narrows the union to the declarations carrying the optional insert entry
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

/**
 * The full insert-registration view the registrar (`@/inkling/plugins/CardInsertPlugin`)
 * reads: every card's insert projection in the merged card order (built-ins first,
 * host cards after), with built-in entries reused from `CARD_INSERT_COMMANDS`
 * verbatim. A function rather than a constant so host cards defined after module
 * init still join; the per-card `hasNodes` guard at the registration site keeps a
 * surface that did not compose the card's node from registering its command.
 */
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
        // the class comes from the same memoized assembler defineCard used, and the
        // command from the same resolver the menu projection uses, so dispatch and
        // registration agree
        node: assembleCardNodeOnce<LexicalNode>(facts.host.spec),
        command: resolveCardInsertCommand(facts.nodeType),
        insert,
        pickerAutoOpen: facts.host.spec.picker?.autoOpenOnInsert === true,
      },
    ]
  })
}
