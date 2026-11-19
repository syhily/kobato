import { CARD_DECLARATIONS } from '@kobato/inkling-internal/nodes/cards/'
import { getHostCard, getHostCards, type HostCardRecord } from '@kobato/inkling-internal/nodes/cards/host-card-registry'

type BuiltinCardDeclaration = (typeof CARD_DECLARATIONS)[number]

export type CardFacts =
  | { source: 'builtin'; nodeType: string; declaration: BuiltinCardDeclaration }
  | { source: 'host'; nodeType: string; host: HostCardRecord }

const CARD_DECLARATIONS_BY_TYPE = new Map<string, BuiltinCardDeclaration>(
  CARD_DECLARATIONS.map((declaration) => [declaration.nodeType, declaration]),
)

export function resolveCardFacts(nodeType: string): CardFacts | undefined {
  const declaration = CARD_DECLARATIONS_BY_TYPE.get(nodeType)
  if (declaration !== undefined) {
    return { source: 'builtin', nodeType, declaration }
  }
  const host = getHostCard(nodeType)
  return host === undefined ? undefined : { source: 'host', nodeType, host }
}

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

export function getCardToolbarLabel(nodeType: string | undefined | null): string | undefined {
  if (!nodeType) {
    return undefined
  }
  const facts = resolveCardFacts(nodeType)
  return facts?.source === 'builtin' ? facts.declaration.toolbarLabel : facts?.host.spec.toolbarLabel
}
