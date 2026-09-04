import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import InklingCardWrapper from '@/components/InklingCardWrapper'
import { registerCardDecorate } from '@/nodes/card-decorate-slot'
import { getCardDecorateTarget } from '@/nodes/cards/card-decorate'

/**
 * The one shared decorate() adapter (plan 039): every card's `decorate()`
 * reaches here through the injection port (`@/nodes/card-decorate-slot`) —
 * the registered call below is this module's one side effect, and the `.`
 * barrel's side-effect import of this module is what fills the slot for
 * every full-entry consumer (keeping the adapter itself off the assembled
 * classes' static import graph, so the `./headless` entry stays free of the
 * React component tree). The adapter reads the card's decorate-target — the
 * React-free wrapper props from the declaration's `decorateTarget`, plus the
 * component render and indicator icon from the wrapper-layer projection
 * (`@/nodes/cards/card-decorate`) — and renders via `InklingCardWrapper`,
 * which consumes exactly `width`, `wrapperStyle`, and `IndicatorIcon` (plus
 * `nodeKey`/`children`). Undefined props are dropped by React, so cards that
 * declare no wrapper props render exactly what their hand-written decorate()
 * did.
 */
export function decorateCard(node: LexicalNode): ReactNode {
  const target = getCardDecorateTarget(node.getType())
  if (!target) {
    throw new Error(`[decorateCard] No decorate-target declared for card node type "${node.getType()}"`)
  }

  const { width, wrapperStyle } = target.decorateTarget ?? {}
  const resolvedWidth = typeof width === 'function' ? width(node) : width

  return (
    <InklingCardWrapper
      IndicatorIcon={target.IndicatorIcon}
      nodeKey={node.getKey()}
      width={resolvedWidth}
      wrapperStyle={wrapperStyle}
    >
      {target.render(node)}
    </InklingCardWrapper>
  )
}

// Registration into the decorate() injection port is an explicit call, not a
// module side effect: the package's sideEffects table (CSS only) lets the
// bundler drop side-effect-only modules, and an unreachable-when-headless
// side effect is exactly what the `./headless` split depends on dropping.
// The `.` barrel calls this at module scope, so every full-entry consumer
// has card decorate() wired before Lexical reconciles a card node; unit
// tests that exercise decorate() without the barrel call it themselves.
export function registerCardDecorateAdapter(): void {
  registerCardDecorate(decorateCard)
}
