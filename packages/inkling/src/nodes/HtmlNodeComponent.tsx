import type { HtmlNode } from '@kobato/inkling-internal/nodes/HtmlNode'

import IndicatorIcon from '@kobato/inkling-internal/assets/icons/inkling-indicator-html.svg?react'
import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { HtmlCard } from '@kobato/inkling-internal/components/ui/cards/HtmlCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { $isHtmlNode } from '@kobato/inkling-internal/nodes/HtmlNode'
import { useContext } from 'react'
export function HtmlNodeComponent({ nodeKey, html }: { nodeKey: string; html?: string }) {
  const { setField } = useCardChrome(nodeKey, $isHtmlNode)
  const { darkMode } = useContext(InklingUiPrefsContext)

  const isEditing = useCardIsEditing(nodeKey)

  const updateHtml = setField('html')

  return (
    <>
      <HtmlCard darkMode={darkMode} html={html} isEditing={isEditing} updateHtml={updateHtml} />

      <CardActionToolbar editDataTestId="edit-html" nodeKey={nodeKey} />
    </>
  )
}

export { IndicatorIcon }

export function renderHtmlCard(node: HtmlNode) {
  return <HtmlNodeComponent html={node.html} nodeKey={node.getKey()} />
}
