import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import InklingCardWrapper from '@/inkling/components/InklingCardWrapper'
import { registerCardDecorate } from '@/inkling/nodes/card-decorate-slot'
import { getCardDecorateTarget } from '@/inkling/nodes/cards/card-decorate'

/**
 * The one shared decorate() adapter: every card's `decorate()` reaches here through
 * the injection port (`@/inkling/nodes/card-decorate-slot`) — the registered call
 * below is this module's one side effect, and the `.` barrel's side-effect import
 * of this module fills the slot for every full-entry consumer, keeping the adapter
 * off the assembled classes' static import graph so the `./headless` entry stays
 * free of the React component tree. Undefined wrapper props are dropped by React,
 * so cards that declare none render exactly what their hand-written decorate()
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

// Registration into the decorate() injection port is an explicit top-level call
// the `.` barrel makes, not a module side effect: consumers import inkling as
// source, so no packaging metadata guarantees a side-effect-only module survives
// tree-shaking. The slot itself must stay because `decorate()` is synchronous —
// a dynamic import cannot fill it lazily; unit tests that exercise decorate()
// without the barrel call this themselves.
export function registerCardDecorateAdapter(): void {
  registerCardDecorate(decorateCard)
}
