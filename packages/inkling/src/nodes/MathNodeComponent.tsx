import type { MathNode } from '@kobato/inkling-internal/nodes/MathNode'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { MathCard } from '@kobato/inkling-internal/components/ui/cards/MathCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useInklingMathSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { useReselectOnEscape } from '@kobato/inkling-internal/hooks/useReselectOnEscape'
import { $isMathNode } from '@kobato/inkling-internal/nodes/MathNode'
import { type NodeKey } from 'lexical'

export interface MathNodeComponentProps {
  nodeKey: NodeKey
  tex?: string
  mathml?: string
  svg?: string
}

export function MathNodeComponent({ nodeKey, tex, mathml, svg }: MathNodeComponentProps) {
  const { setField } = useCardChrome(nodeKey, $isMathNode)
  const { renderMath } = useInklingMathSettings()
  const isEditing = useCardIsEditing(nodeKey)
  const exitEditMode = useReselectOnEscape(nodeKey)

  const updateTex = setField('tex')

  return (
    <>
      <MathCard
        isEditing={isEditing}
        mathml={mathml}
        renderMath={renderMath}
        svg={svg}
        tex={tex}
        updateTex={updateTex}
        onEscape={exitEditMode}
      />
      <CardActionToolbar editDataTestId="edit-math-card" nodeKey={nodeKey} />
    </>
  )
}

/**
 * Math's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@kobato/inkling-internal/nodes/cards/card-decorate`.
 */
export function renderMathCard(node: MathNode) {
  return <MathNodeComponent mathml={node.mathml} nodeKey={node.getKey()} svg={node.svg} tex={node.tex} />
}
