import { type NodeKey } from 'lexical'

import type { MathNode } from '@/inkling/nodes/MathNode'

import { CardActionToolbar } from '@/inkling/components/ui/CardActionToolbar'
import { MathCard } from '@/inkling/components/ui/cards/MathCard'
import { useCardIsEditing } from '@/inkling/context/CardSelectionStoreContext'
import { useInklingMathSettings } from '@/inkling/context/InklingHostIntegrationContext'
import { useCardChrome } from '@/inkling/hooks/useCardChrome'
import { useReselectOnEscape } from '@/inkling/hooks/useReselectOnEscape'
import { $isMathNode } from '@/inkling/nodes/MathNode'

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
 * paired with the declaration by `@/inkling/nodes/cards/card-decorate`.
 */
export function renderMathCard(node: MathNode) {
  return <MathNodeComponent mathml={node.mathml} nodeKey={node.getKey()} svg={node.svg} tex={node.tex} />
}
