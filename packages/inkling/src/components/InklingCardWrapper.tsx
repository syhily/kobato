import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

import { CardWrapper } from '@/components/ui/CardWrapper'
import CardContext from '@/context/CardContext'
import { useCardSelectionState, useCardSelectionStore } from '@/context/CardSelectionStoreContext'
import { useDragDropHandleState } from '@/context/DragDropHandleContext'
import { useSharedEditorStateContext } from '@/context/SharedEditorStateContext'
import { type CardWidth } from '@/nodes/base/utils/card-widths'
import { registerCardInteraction } from '@/plugins/behaviour/card-interaction'
import { purgeDeadEditorHistoryEntries } from '@/plugins/behaviour/history-purge'

interface InklingCardWrapperProps {
  nodeKey: NodeKey
  width?: CardWidth
  wrapperStyle?: string
  IndicatorIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  children?: React.ReactNode
}

// The select→edit click choreography lives in
// `@/plugins/behaviour/card-interaction` (one stable registration per card);
// this component keeps the render, the card-type init read, and the width
// dataset marker.
const InklingCardWrapper = ({ nodeKey, width, wrapperStyle, IndicatorIcon, children }: InklingCardWrapperProps) => {
  const [editor] = useLexicalComposerContext()
  const { historyState } = useSharedEditorStateContext()
  const [cardType, setCardType] = React.useState<string | null>(null)
  const [captionHasFocus, setCaptionHasFocus] = React.useState(false)
  const normalizedWidth = width ?? 'regular'
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  const cardSelectionStore = useCardSelectionStore()
  const isDragging = useDragDropHandleState((state) => state.isDragging)
  const selectedCardKey = useCardSelectionState((state) => state.selectedCardKey)
  const isEditingCard = useCardSelectionState((state) => state.isEditingCard)

  const isSelected = selectedCardKey === nodeKey
  const isEditing = isSelected && isEditingCard

  React.useLayoutEffect(() => {
    editor.getEditorState().read(() => {
      const cardNode = $getNodeByKey(nodeKey)
      setCardType(cardNode ? cardNode.getType() : null)
    })

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    return registerCardInteraction(editor, nodeKey, {
      store: cardSelectionStore,
      getContainer: () => containerRef.current,
    })
  }, [editor, nodeKey, cardSelectionStore])

  React.useEffect(() => {
    // On card removal, drop history entries owned by the card's dying nested
    // editors so the next undo cannot pop an entry that applies nowhere.
    // Their root elements are already detached when this cleanup runs; on a
    // StrictMode effect replay the roots stay attached and this is a no-op.
    return () => {
      purgeDeadEditorHistoryEntries(historyState, editor)
    }
  }, [editor, historyState])

  React.useEffect(() => {
    // add a property to the parent element that's added directly by Lexical
    // so we can target it via CSS for things like spacing between stacked full-width cards
    if (containerRef.current?.parentElement) {
      // avoid setting property when 'regular' so there's less test churn
      if (normalizedWidth === 'regular') {
        delete containerRef.current.parentElement.dataset.inklingCardWidth
      } else {
        containerRef.current.parentElement.dataset.inklingCardWidth = normalizedWidth
      }
    }
  }, [normalizedWidth])

  const cardContextValue = React.useMemo(
    () => ({
      captionHasFocus,
      cardType,
      setCaptionHasFocus,
      nodeKey,
    }),
    // setState dispatchers are stable and do not need to be listed
    [captionHasFocus, cardType, nodeKey],
  )

  return (
    <CardContext.Provider value={cardContextValue}>
      <CardWrapper
        ref={containerRef}
        cardType={cardType ?? undefined}
        cardWidth={normalizedWidth}
        IndicatorIcon={IndicatorIcon}
        isDragging={isDragging}
        isEditing={isEditing}
        isSelected={isSelected}
        wrapperStyle={wrapperStyle}
      >
        {children}
      </CardWrapper>
    </CardContext.Provider>
  )
}

export default InklingCardWrapper
