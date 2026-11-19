import type { DecorateTargetSpec } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { LexicalNode } from 'lexical'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import { renderHorizontalRuleCard } from '@kobato/inkling-internal/components/ui/cards/HorizontalRuleCard'
import { renderAudioCard } from '@kobato/inkling-internal/nodes/AudioNodeComponent'
import { renderBookmarkCard } from '@kobato/inkling-internal/nodes/BookmarkNodeComponent'
import { renderButtonCard } from '@kobato/inkling-internal/nodes/ButtonNodeComponent'
import { renderCalloutCard } from '@kobato/inkling-internal/nodes/CalloutNodeComponent'
import { CARD_DECLARATIONS, type CardNodeType } from '@kobato/inkling-internal/nodes/cards/'
import { resolveCardFacts, type CardFacts } from '@kobato/inkling-internal/nodes/cards/card-facts'
import { renderCodeBlockCard } from '@kobato/inkling-internal/nodes/CodeBlockNodeComponent'
import { renderFileCard } from '@kobato/inkling-internal/nodes/FileNodeComponent'
import { renderFootnoteDefinitionCard } from '@kobato/inkling-internal/nodes/FootnoteDefinitionNodeComponent'
import { renderGalleryCard } from '@kobato/inkling-internal/nodes/GalleryNodeComponent'
import { renderHeaderCard } from '@kobato/inkling-internal/nodes/header/HeaderNodeComponent'
import { IndicatorIcon as HtmlIndicatorIcon, renderHtmlCard } from '@kobato/inkling-internal/nodes/HtmlNodeComponent'
import { renderImageCard } from '@kobato/inkling-internal/nodes/ImageNodeComponent'
import { renderMathCard } from '@kobato/inkling-internal/nodes/MathNodeComponent'
import { renderToggleCard } from '@kobato/inkling-internal/nodes/ToggleNodeComponent'
import { renderVideoCard } from '@kobato/inkling-internal/nodes/VideoNodeComponent'

interface CardDecorateModule {
  render(node: LexicalNode): ReactNode
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
}
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

export const CARD_DECORATE_TARGETS = CARD_DECLARATIONS.map((declaration) => {
  const decorateTarget: DecorateTargetSpec | undefined =
    'decorateTarget' in declaration ? declaration.decorateTarget : undefined
  const module = CARD_DECORATE_MODULES[declaration.nodeType]
  return Object.assign({}, declaration, {
    decorateTarget,
    render: (node: LexicalNode) => module.render(node),
    IndicatorIcon: decorateTarget?.hasIndicatorIcon ? module.IndicatorIcon : undefined,
  })
})
const CARD_DECORATE_TARGETS_BY_TYPE = new Map(
  CARD_DECORATE_TARGETS.map((target): [string, (typeof CARD_DECORATE_TARGETS)[number]] => [target.nodeType, target]),
)

export interface CardDecorateTarget {
  nodeType: string
  decorateTarget: DecorateTargetSpec | undefined
  render(node: LexicalNode): ReactNode
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
}

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

export function getCardDecorateTarget(nodeType: string): CardDecorateTarget | undefined {
  const facts = resolveCardFacts(nodeType)
  return facts === undefined ? undefined : resolveCardDecorateTarget(facts)
}
