import type { LexicalNode } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type { DecorateTargetSpec } from '@/nodes/cards/card-declaration'

import { renderHorizontalRuleCard } from '@/components/ui/cards/HorizontalRuleCard'
import { renderAudioCard } from '@/nodes/AudioNodeComponent'
import { renderBookmarkCard } from '@/nodes/BookmarkNodeComponent'
import { renderButtonCard } from '@/nodes/ButtonNodeComponent'
import { renderCalloutCard } from '@/nodes/CalloutNodeComponent'
import { CARD_DECLARATIONS, type CardNodeType } from '@/nodes/cards'
import { resolveCardFacts, type CardFacts } from '@/nodes/cards/card-facts'
import { renderCodeBlockCard } from '@/nodes/CodeBlockNodeComponent'
import { renderFileCard } from '@/nodes/FileNodeComponent'
import { renderFootnoteDefinitionCard } from '@/nodes/FootnoteDefinitionNodeComponent'
import { renderGalleryCard } from '@/nodes/GalleryNodeComponent'
import { renderHeaderCard } from '@/nodes/header/HeaderNodeComponent'
import { IndicatorIcon as HtmlIndicatorIcon, renderHtmlCard } from '@/nodes/HtmlNodeComponent'
import { renderImageCard } from '@/nodes/ImageNodeComponent'
import { renderMathCard } from '@/nodes/MathNodeComponent'
import { renderToggleCard } from '@/nodes/ToggleNodeComponent'
import { renderVideoCard } from '@/nodes/VideoNodeComponent'

/**
 * The React-bearing half of a card's decorate-target: the node→component
 * render (and the indicator icon, for the one card that has one). Each lives
 * beside its card component in the `*NodeComponent` files — it cannot live
 * in the declaration modules, which must stay React-free. Method-syntax
 * `render` keeps the per-card node parameter types (each card's `render`
 * takes its own wrapper node type) assignable here.
 */
interface CardDecorateModule {
  render(node: LexicalNode): ReactNode
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
}

/**
 * The per-card decorate modules, keyed by card node type with an exhaustive
 * `Record` so adding a declaration without its module fails typecheck. The
 * only hand-maintained pairing left; everything else is derived from
 * `CARD_DECLARATIONS`.
 */
const CARD_DECORATE_MODULES: Record<CardNodeType, CardDecorateModule> = {
  audio: { render: renderAudioCard },
  bookmark: { render: renderBookmarkCard },
  button: { render: renderButtonCard },
  callout: { render: renderCalloutCard },
  codeblock: { render: renderCodeBlockCard },
  file: { render: renderFileCard },
  footnotedefinition: { render: renderFootnoteDefinitionCard },
  gallery: { render: renderGalleryCard },
  header: { render: renderHeaderCard },
  horizontalrule: { render: renderHorizontalRuleCard },
  html: { render: renderHtmlCard, IndicatorIcon: HtmlIndicatorIcon },
  image: { render: renderImageCard },
  math: { render: renderMathCard },
  toggle: { render: renderToggleCard },
  video: { render: renderVideoCard },
}

/**
 * Wrapper-layer projection of the card declarations: each declaration paired
 * with the React-bearing half of its decorate-target. The indicator icon is
 * gated by the declaration's `decorateTarget.hasIndicatorIcon` flag (Html is
 * the only card with one). The shared adapter (`@/nodes/decorate-card`)
 * renders these through `InklingCardWrapper`.
 */
export const CARD_DECORATE_TARGETS = CARD_DECLARATIONS.map((declaration) => {
  // `in` narrows the union to the declarations carrying the optional decorate-target entry
  const decorateTarget: DecorateTargetSpec | undefined =
    'decorateTarget' in declaration ? declaration.decorateTarget : undefined
  const module = CARD_DECORATE_MODULES[declaration.nodeType]
  return {
    ...declaration,
    decorateTarget,
    render: (node: LexicalNode) => module.render(node),
    IndicatorIcon: decorateTarget?.hasIndicatorIcon ? module.IndicatorIcon : undefined,
  }
})

const CARD_DECORATE_TARGETS_BY_TYPE = new Map(
  CARD_DECORATE_TARGETS.map((target): [string, (typeof CARD_DECORATE_TARGETS)[number]] => [target.nodeType, target]),
)

/**
 * The structural decorate-target type `getCardDecorateTarget` returns. The
 * built-in targets keep their precise per-card types in
 * `CARD_DECORATE_TARGETS` (the exhaustive `Record<CardNodeType, …>` guard
 * above is unchanged); the widened return type admits the host card
 * projections (CONTEXT.md: "host card"), which carry the same facts derived
 * from the raw registry spec.
 */
export interface CardDecorateTarget {
  nodeType: string
  decorateTarget: DecorateTargetSpec | undefined
  render(node: LexicalNode): ReactNode
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
}

/**
 * The one decorate-target projection every consumer shares: built-in
 * declarations resolve to their paired `CARD_DECORATE_TARGETS` entry; a host
 * spec carries the same facts in one place (its `render`, its
 * `decorateTarget`, its indicator icon) and projects through the same
 * `hasIndicatorIcon` gate — there is no host-side copy of the gating.
 */
export function resolveCardDecorateTarget(facts: CardFacts): CardDecorateTarget | undefined {
  if (facts.source === 'builtin') {
    return CARD_DECORATE_TARGETS_BY_TYPE.get(facts.nodeType)
  }
  const { spec } = facts.host
  return {
    nodeType: facts.nodeType,
    decorateTarget: spec.decorateTarget,
    render: (node: LexicalNode) => spec.render(node),
    IndicatorIcon: spec.decorateTarget?.hasIndicatorIcon ? spec.IndicatorIcon : undefined,
  }
}

/**
 * Resolves a card's decorate target by node type. The built-in-first /
 * host-fallback merge lives in `@/nodes/cards/card-facts`.
 */
export function getCardDecorateTarget(nodeType: string): CardDecorateTarget | undefined {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardDecorateTarget(facts)
}
