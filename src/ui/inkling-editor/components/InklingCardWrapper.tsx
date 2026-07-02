import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW, type NodeKey } from 'lexical'
import React from 'react'

import type { CardNode } from '@/ui/inkling-editor/types/lexical-internals'

import { CardWrapper } from '@/ui/inkling-editor/components/ui/CardWrapper'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { useInklingSelectedCardContext } from '@/ui/inkling-editor/context/InklingSelectedCardContext'
import {
  EDIT_CARD_COMMAND,
  SELECT_CARD_COMMAND,
  SHOW_CARD_VISIBILITY_SETTINGS_COMMAND,
} from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { VISIBILITY_SETTINGS } from '@/ui/inkling-editor/utils/visibility'

interface InklingCardWrapperProps {
  nodeKey: NodeKey
  width?: string
  wrapperStyle?: string
  IndicatorIcon?: React.ComponentType<Record<string, unknown>>
  className?: string
  isVisibilityActive?: boolean
  children?: React.ReactNode
  [key: string]: unknown
}

const InklingCardWrapper = ({ nodeKey, width, wrapperStyle, IndicatorIcon, children }: InklingCardWrapperProps) => {
  const { cardConfig } = React.useContext(InklingComposerContext)
  const [editor] = useLexicalComposerContext()
  const [cardType, setCardType] = React.useState<string | null>(null)
  const [captionHasFocus, setCaptionHasFocus] = React.useState<boolean | null>(null)
  const [cardWidth, setCardWidth] = React.useState<string>(width || 'regular')
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const skipClick = React.useRef(false)

  const { selectedCardKey, isEditingCard, isDragging } = useInklingSelectedCardContext()

  const isSelected = selectedCardKey === nodeKey
  const isEditing = isSelected && isEditingCard

  const handleVisibilityToggle = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      editor.dispatchCommand(SHOW_CARD_VISIBILITY_SETTINGS_COMMAND, { cardKey: nodeKey })
    },
    [editor, nodeKey],
  )

  React.useLayoutEffect(() => {
    editor.getEditorState().read(() => {
      const cardNode = $getNodeByKey(nodeKey)
      setCardType(cardNode ? cardNode.getType() : null)
    })

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    return mergeRegister(
      // we register a click command at the editor level rather than the React level
      // so that we can prevent the editor's default click behaviour without also
      // preventing the click behaviour of other React components inside the card
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          if (!skipClick.current && containerRef.current && containerRef.current.contains(event.target as Node)) {
            const cardNode = $getNodeByKey(nodeKey) as CardNode | null
            const clickedDifferentEditor = !cardNode
            const target = event.target as HTMLElement
            const clickedToolbar = target.closest('[data-inkling-allow-clickthrough="false"]')
            const clickedSettingsPanel = target.closest('[data-inkling-settings-panel]')

            if (isSelected && cardNode?.hasEditMode?.() && !isEditing && !clickedToolbar && !clickedSettingsPanel) {
              editor.dispatchCommand(EDIT_CARD_COMMAND, {
                cardKey: nodeKey,
                focusEditor: !clickedDifferentEditor,
              })
            } else if (!isSelected) {
              editor.dispatchCommand(SELECT_CARD_COMMAND, {
                cardKey: nodeKey,
                focusEditor: !clickedDifferentEditor,
              })
            }

            if (clickedDifferentEditor) {
              // click is in a different editor
              return false
            }

            return true
          }

          if (skipClick.current === true) {
            skipClick.current = false
            return true
          }

          skipClick.current = false
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  })

  React.useEffect(() => {
    // add a property to the parent element that's added directly by Lexical
    // so we can target it via CSS for things like spacing between stacked full-width cards
    if (containerRef.current?.parentElement) {
      // avoid setting property when 'regular' so there's less test churn
      if (cardWidth === 'regular') {
        delete containerRef.current.parentElement.dataset.inklingCardWidth
      } else {
        if (cardWidth !== width) {
          setCardWidth(cardWidth)
        }
        // we are now using the width passed from the property instead of the state, as it is the source of truth
        containerRef.current.parentElement.dataset.inklingCardWidth = width
      }
    }
  }, [cardWidth, containerRef, width])

  const setEditing = (shouldEdit: boolean) => {
    // convert nodeKey to int
    if (shouldEdit) {
      editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    } else if (!isSelected) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
    }
  }

  React.useEffect(() => {
    const container = containerRef.current

    function handleMousedown(event: MouseEvent) {
      if (!isSelected && !isEditing) {
        editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })

        // skip CLICK_COMMAND behaviour otherwise we'll immediately enter edit mode
        skipClick.current = true

        // in most situations we want to prevent default behaviour which
        // can cause an underlying cursor position change but inputs and
        // textareas are different and we want the focus to move to them
        // immediately when clicked
        const target = event.target as HTMLElement
        const targetTagName = target.tagName
        const allowedTagNames = ['INPUT', 'TEXTAREA']
        const allowClickthrough = !!target.closest('[data-inkling-allow-clickthrough]')

        if (!allowedTagNames.includes(targetTagName) && !allowClickthrough) {
          event.preventDefault()
        }
      }
    }

    container?.addEventListener('mousedown', handleMousedown)

    return () => {
      container?.removeEventListener('mousedown', handleMousedown)
    }
  }, [editor, isSelected, isEditing, nodeKey, containerRef])

  let isVisibilityActive = false
  if (cardConfig?.visibilitySettings !== VISIBILITY_SETTINGS.NONE) {
    editor.getEditorState().read(() => {
      const cardNode = $getNodeByKey(nodeKey) as CardNode | null
      isVisibilityActive = !!cardNode?.getIsVisibilityActive?.()
    })
  }

  const cardContextValue = React.useMemo(
    () => ({
      isSelected,
      captionHasFocus,
      isEditing,
      cardWidth,
      setCardWidth,
      setCaptionHasFocus,
      setEditing,
      nodeKey,
      cardContainerRef: containerRef,
    }),
    // setState dispatchers are stable and do not need to be listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSelected, captionHasFocus, isEditing, cardWidth, nodeKey, containerRef],
  )

  return (
    <CardContext.Provider value={cardContextValue}>
      <CardWrapper
        ref={containerRef}
        cardType={cardType}
        cardWidth={width}
        feature={cardConfig?.feature}
        IndicatorIcon={IndicatorIcon}
        isDragging={isDragging}
        isEditing={isEditing}
        isSelected={isSelected}
        isVisibilityActive={isVisibilityActive}
        wrapperStyle={wrapperStyle}
        onIndicatorClick={handleVisibilityToggle}
      >
        {children}
      </CardWrapper>
    </CardContext.Provider>
  )
}

export default InklingCardWrapper
