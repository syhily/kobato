import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import InklingCardWrapper from '@/inkling/components/InklingCardWrapper'
import { registerCardDecorate } from '@/inkling/nodes/card-decorate-slot'
import { getCardDecorateTarget } from '@/inkling/nodes/cards/card-decorate'

/**
 * The one shared decorate() adapter (plan 039): every card's `decorate()`
 * reaches here through the injection port (`@/inkling/nodes/card-decorate-slot`) —
 * the registered call below is this module's one side effect, and the `.`
 * barrel's side-effect import of this module is what fills the slot for
 * every full-entry consumer (keeping the adapter itself off the assembled
 * classes' static import graph, so the `./headless` entry stays free of the
 * React component tree). The adapter reads the card's decorate-target — the
 * React-free wrapper props from the declaration's `decorateTarget`, plus the
 * component render and indicator icon from the wrapper-layer projection
 * (`@/inkling/nodes/cards/card-decorate`) — and renders via `InklingCardWrapper`,
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

// Registration into the decorate() injection port is an explicit call the `.`
// barrel makes at module top level, not a module side effect: consumers
// import inkling as source, so there is no packaging metadata guaranteeing a
// side-effect-only module survives bundler tree-shaking — the top-level call
// is the belt-and-braces guarantee that registration happens regardless of
// the bundler's side-effect assumptions. The slot itself must stay because
// `decorate()` is synchronous: a dynamic import cannot fill it lazily, and an
// unregistered slot throws the first time a card node renders. Unit tests
// that exercise decorate() without the barrel call it themselves.
export function registerCardDecorateAdapter(): void {
  registerCardDecorate(decorateCard)
}
