import React from 'react'

import type { HtmlNode } from '@/nodes/HtmlNode'

import IndicatorIcon from '@/assets/icons/inkling-indicator-html.svg?react'
import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { HtmlCard } from '@/components/ui/cards/HtmlCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { $isHtmlNode } from '@/nodes/HtmlNode'

export function HtmlNodeComponent({ nodeKey, html }: { nodeKey: string; html?: string }) {
  const { setField } = useCardChrome(nodeKey, $isHtmlNode)
  const { darkMode } = React.useContext(InklingUiPrefsContext)

  const isEditing = useCardIsEditing(nodeKey)

  const updateHtml = setField('html')

  return (
    <>
      <HtmlCard darkMode={darkMode} html={html} isEditing={isEditing} updateHtml={updateHtml} />

      <CardActionToolbar editDataTestId="edit-html" nodeKey={nodeKey} />
    </>
  )
}

// Html is the only card with an indicator icon; the declaration's
// `decorateTarget.hasIndicatorIcon` flag gates its attachment.
export { IndicatorIcon }

/**
 * Html's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderHtmlCard(node: HtmlNode) {
  return <HtmlNodeComponent html={node.html} nodeKey={node.getKey()} />
}
