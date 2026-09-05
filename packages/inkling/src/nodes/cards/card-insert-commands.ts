import type { Klass, LexicalCommand, LexicalNode } from 'lexical'

import type { CardInsertSpec } from '@/nodes/cards/card-declaration'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { resolveCardInsertCommand } from '@/nodes/cards/card-commands'
import { resolveAllCardFacts } from '@/nodes/cards/card-facts'
import { CARD_WRAPPER_NODES } from '@/nodes/cards/card-wrappers'

export interface CardInsertRegistration {
  nodeType: string
  node: Klass<LexicalNode>
  command: LexicalCommand<unknown>
  insert: CardInsertSpec
}

/**
 * Wrapper-layer projection of the card declarations (plan 043): each
 * insert-bearing declaration paired with the wrapper node class the
 * registration guards and constructs (from the `card-wrappers` projection)
 * and the card's insert command, derived from its node type by
 * `resolveCardInsertCommand` — the declaration's insert spec carries only
 * flags, never a command object. Kept out of the declaration modules so they
 * stay React-free; the registrar (`@/plugins/CardInsertPlugin`) is the
 * derived view over this list. CodeBlock and HorizontalRule declare no
 * `insert` and drop out here.
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
 * The full insert-registration view the registrar (`@/plugins/CardInsertPlugin`)
 * reads: every card's insert projection in the merged card order — built-in
 * declarations first, host cards (CONTEXT.md: "host card") after — owned by
 * `@/nodes/cards/card-facts`; this view only projects each side to its
 * registration (the built-in side reusing the `CARD_INSERT_COMMANDS` entries
 * verbatim). A function rather than a constant so host cards defined after
 * module init still join — the per-card `hasNodes` guard at the registration
 * site keeps a surface that did not compose the card's node from registering
 * its command.
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
        // the registry stores the raw spec; the class comes from the same
        // memoized assembler defineCard used, so the registration guards and
        // constructs the exact class the host composed — and the insert
        // command derives from the node type through the same resolver the
        // menu projection uses, so dispatch and registration name one object
        node: assembleCardNodeOnce<LexicalNode>(facts.host.spec),
        command: resolveCardInsertCommand(facts.nodeType),
        insert,
      },
    ]
  })
}
