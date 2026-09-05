import { type NodeKey } from 'lexical'

import type { MathNode } from '@/nodes/MathNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { MathCard } from '@/components/ui/cards/MathCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { useInklingMathSettings } from '@/context/InklingHostIntegrationContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useReselectOnEscape } from '@/hooks/useReselectOnEscape'
import { $isMathNode } from '@/nodes/MathNode'

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
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderMathCard(node: MathNode) {
  return <MathNodeComponent mathml={node.mathml} nodeKey={node.getKey()} svg={node.svg} tex={node.tex} />
}
