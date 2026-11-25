import { CardWrapper } from '@kobato/inkling-internal/components/ui/CardWrapper'
import CardContext from '@kobato/inkling-internal/context/CardContext'
import {
  useCardSelectionState,
  useCardSelectionStore,
} from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useDragDropHandleState } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { useSharedEditorStateContext } from '@kobato/inkling-internal/context/SharedEditorStateContext'
import { type CardWidth } from '@kobato/inkling-internal/nodes/base/utils/card-widths'
import { registerCardInteraction } from '@kobato/inkling-internal/plugins/behaviour/card-interaction'
import { purgeDeadEditorHistoryEntries } from '@kobato/inkling-internal/plugins/behaviour/history-purge'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import {
  type ComponentType,
  type SVGProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
interface InklingCardWrapperProps {
  nodeKey: NodeKey
  width?: CardWidth
  wrapperStyle?: string
  IndicatorIcon?: ComponentType<SVGProps<SVGSVGElement>>
  children?: ReactNode
}

const InklingCardWrapper = ({ nodeKey, width, wrapperStyle, IndicatorIcon, children }: InklingCardWrapperProps) => {
  const [editor] = useLexicalComposerContext()
  const { historyState } = useSharedEditorStateContext()
  const [cardType, setCardType] = useState<string | null>(null)
  const [captionHasFocus, setCaptionHasFocus] = useState(false)
  const normalizedWidth = width ?? 'regular'
  const containerRef = useRef<HTMLDivElement | null>(null)

  const cardSelectionStore = useCardSelectionStore()
  const isDragging = useDragDropHandleState((state) => state.isDragging)
  const selectedCardKey = useCardSelectionState((state) => state.selectedCardKey)
  const isEditingCard = useCardSelectionState((state) => state.isEditingCard)

  const isSelected = selectedCardKey === nodeKey
  const isEditing = isSelected && isEditingCard

  useLayoutEffect(() => {
    editor.getEditorState().read(() => {
      const cardNode = $getNodeByKey(nodeKey)
      setCardType(cardNode ? cardNode.getType() : null)
    })
  }, [editor, nodeKey])

  useEffect(() => {
    return registerCardInteraction(editor, nodeKey, {
      store: cardSelectionStore,
      getContainer: () => containerRef.current,
    })
  }, [editor, nodeKey, cardSelectionStore])

  useEffect(() => {
    return () => {
      purgeDeadEditorHistoryEntries(historyState, editor)
    }
  }, [editor, historyState])

  useEffect(() => {
    if (containerRef.current?.parentElement) {
      if (normalizedWidth === 'regular') {
        delete containerRef.current.parentElement.dataset.inklingCardWidth
      } else {
        containerRef.current.parentElement.dataset.inklingCardWidth = normalizedWidth
      }
    }
  }, [normalizedWidth])

  const cardContextValue = useMemo(
    () => ({
      captionHasFocus,
      cardType,
      setCaptionHasFocus,
      nodeKey,
    }),

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
