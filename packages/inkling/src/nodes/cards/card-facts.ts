import { CARD_DECLARATIONS } from '@/nodes/cards'
import { getHostCard, getHostCards, type HostCardRecord } from '@/nodes/cards/host-card-registry'

type BuiltinCardDeclaration = (typeof CARD_DECLARATIONS)[number]

/**
 * One card's facts resolved across both card registries (CONTEXT.md: "card
 * declaration", "host card"). This module is the single home of the merge
 * policy every derived view shares: the built-in declarations answer first;
 * the host card registry is a fallback, never an override. `source`
 * discriminates which registry answered — the views then project their own
 * fields off the declaration or the host record.
 *
 * Registry-layer only: imports the declarations and the host registry, never
 * the wrapper/decorate layers, so every derived view (including the
 * cycle-sensitive ones like `getEditorCardNodes`) can read it safely.
 */
export type CardFacts =
  | { source: 'builtin'; nodeType: string; declaration: BuiltinCardDeclaration }
  | { source: 'host'; nodeType: string; host: HostCardRecord }

const CARD_DECLARATIONS_BY_TYPE = new Map<string, BuiltinCardDeclaration>(
  CARD_DECLARATIONS.map((declaration) => [declaration.nodeType, declaration]),
)

/**
 * Resolves one card's facts by node type: the built-in declaration when one
 * matches, the host registry record otherwise, `undefined` when neither knows
 * the type. A host record can never shadow a built-in declaration — the
 * built-in branch answers first unconditionally.
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
 * The list form of the same merge policy: every built-in declaration in
 * declaration order, then every host card in registration order. List views
 * (insert registrations, the registered-card intersection) derive from this
 * so the built-ins-first ordering is stated once, here. A live read — host
 * cards defined after module init still join.
 */
export function resolveAllCardFacts(): CardFacts[] {
  return [
    ...CARD_DECLARATIONS.map(
      (declaration): CardFacts => ({ source: 'builtin', nodeType: declaration.nodeType, declaration }),
    ),
    ...getHostCards().map((host): CardFacts => ({ source: 'host', nodeType: host.nodeType, host })),
  ]
}

/**
 * The card's toolbar label — the `data-inkling-card-toolbar` value
 * `CardActionToolbar` renders on both of its toolbars (a live CSS/e2e
 * selector contract) — resolved by node type over the same merge. Callers
 * key it by the node's own `getType()`, the same path `data-inkling-card`
 * takes, so the label cannot drift from the card it annotates (the
 * historical "signup" header label). CodeBlock ("code-block") and File
 * ("file-upload") deliberately diverge from their node types; the
 * divergence lives on the declarations as data, not in a transform here.
 */
export function getCardToolbarLabel(nodeType: string | undefined | null): string | undefined {
  // unknown is a first-class input, not a smuggled '' sentinel — a card
  // whose type isn't known yet (mount-time context gap) gets no label
  if (!nodeType) {
    return undefined
  }
  const facts = resolveCardFacts(nodeType)
  return facts?.source === 'builtin' ? facts.declaration.toolbarLabel : facts?.host.spec.toolbarLabel
}
