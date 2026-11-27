import type { LexicalNode } from 'lexical'
import type { ReactNode } from 'react'

import InklingCardWrapper from '@kobato/inkling-internal/components/InklingCardWrapper'
import { registerCardDecorate } from '@kobato/inkling-internal/nodes/card-decorate-slot'
import { getCardDecorateTarget } from '@kobato/inkling-internal/nodes/cards/card-decorate'

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

let adapterRegistered = false

export function registerCardDecorateAdapter(): void {
  if (adapterRegistered) {
    return
  }
  adapterRegistered = true
  registerCardDecorate(decorateCard)
}
