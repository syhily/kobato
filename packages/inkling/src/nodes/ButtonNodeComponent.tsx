import { type NodeKey } from 'lexical'
import React from 'react'

import type { ButtonNode } from '@/nodes/ButtonNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { ButtonCard } from '@/components/ui/cards/ButtonCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { $isButtonNode } from '@/nodes/base'

export interface ButtonNodeComponentProps {
  alignment?: string
  buttonText?: string
  buttonPlaceholder?: string
  buttonUrl?: string
  nodeKey: NodeKey
}

export function ButtonNodeComponent({
  alignment,
  buttonText,
  buttonPlaceholder,
  buttonUrl,
  nodeKey,
}: ButtonNodeComponentProps) {
  const labels = useInklingLabels()
  const resolvedButtonPlaceholder = buttonPlaceholder ?? labels['button.text.placeholder']
  const { write, setField } = useCardChrome(nodeKey, $isButtonNode)
  const isEditing = useCardIsEditing(nodeKey)

  const handleButtonTextChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    write((node) => {
      node.buttonText = event.target.value
    })
  }

  const handleButtonUrlChange = setField('buttonUrl')

  const handleAlignmentChange = setField('alignment')

  return (
    <>
      <ButtonCard
        alignment={alignment}
        buttonPlaceholder={resolvedButtonPlaceholder}
        buttonText={buttonText}
        buttonUrl={buttonUrl}
        handleAlignmentChange={handleAlignmentChange}
        handleButtonTextChange={handleButtonTextChange}
        handleButtonUrlChange={handleButtonUrlChange}
        isEditing={isEditing}
      />

      <CardActionToolbar editDataTestId="edit-button-card" nodeKey={nodeKey} />
    </>
  )
}

/**
 * Button's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderButtonCard(node: ButtonNode) {
  return (
    <ButtonNodeComponent
      alignment={node.alignment}
      buttonText={node.buttonText}
      buttonUrl={node.buttonUrl}
      nodeKey={node.getKey()}
    />
  )
}
