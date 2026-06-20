import type { ReactNode } from 'react'

import type { HorizontalRuleCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { CardShell } from '@/ui/inkling/editor/cards/card-shell'

export function HorizontalRuleCardComponent({ node }: { node: HorizontalRuleCardNode }): ReactNode {
  return (
    <CardShell nodeKey={node.getKey()} className="py-3">
      <hr className="border-inkling-border" />
    </CardShell>
  )
}
