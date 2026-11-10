import { CARD_DECLARATIONS } from '@/inkling/nodes/cards'
import { getHostCard, getHostCards, type HostCardRecord } from '@/inkling/nodes/cards/host-card-registry'

type BuiltinCardDeclaration = (typeof CARD_DECLARATIONS)[number]

/**
 * One card's facts resolved across both card registries — the single home of the merge
 * policy every derived view shares: built-in declarations answer first, the host
 * registry is a fallback and never an override. Registry-layer only (imports the
 * declarations and the host registry, never the wrapper/decorate layers), so
 * cycle-sensitive derived views can read it safely.
 */
export type CardFacts =
  | { source: 'builtin'; nodeType: string; declaration: BuiltinCardDeclaration }
  | { source: 'host'; nodeType: string; host: HostCardRecord }

const CARD_DECLARATIONS_BY_TYPE = new Map<string, BuiltinCardDeclaration>(
  CARD_DECLARATIONS.map((declaration) => [declaration.nodeType, declaration]),
)

/**
 * Resolves one card's facts by node type: the built-in declaration when one matches,
 * the host registry record otherwise, `undefined` when neither knows the type.
 */
export function resolveCardFacts(nodeType: string): CardFacts | undefined {
  const declaration = CARD_DECLARATIONS_BY_TYPE.get(nodeType)
  if (declaration !== undefined) {
    return { source: 'builtin', nodeType, declaration }
  }
  const host = getHostCard(nodeType)
  return host === undefined ? undefined : { source: 'host', nodeType, host }
}

/**
 * The list form of the merge policy: built-ins in declaration order, then host cards
 * in registration order; list views derive from this so the ordering is stated once.
 * A live read, so host cards defined after module init still join.
 */
export function resolveAllCardFacts(): CardFacts[] {
  return [
    ...CARD_DECLARATIONS.map((declaration): CardFacts => ({
      source: 'builtin',
      nodeType: declaration.nodeType,
      declaration,
    })),
    ...getHostCards().map((host): CardFacts => ({ source: 'host', nodeType: host.nodeType, host })),
  ]
}

/**
 * The card's `data-inkling-card-toolbar` toolbar label, resolved by node type over the
 * same merge (see `CardDeclaration['toolbarLabel']`).
 */
export function getCardToolbarLabel(nodeType: string | undefined | null): string | undefined {
  // unknown is a first-class input, not a smuggled '' sentinel
  if (!nodeType) {
    return undefined
  }
  const facts = resolveCardFacts(nodeType)
  return facts?.source === 'builtin' ? facts.declaration.toolbarLabel : facts?.host.spec.toolbarLabel
}
