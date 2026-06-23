import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { CardWrapper, type CardWrapperStyle } from '@/ui/inkling/components/ui/CardWrapper'
import CardContext, { type CardContextValue } from '@/ui/inkling/context/CardContext'
import { useKoenigSelectedCardContext } from '@/ui/inkling/context/KoenigSelectedCardContext'
import { EDIT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/ui/inkling/editor/commands'

/**
 * Card connector — faithful port of Koenig's KoenigCardWrapper.jsx.
 *
 * Every card node's `decorate()` returns `<KoenigCardWrapper nodeKey={...}>`
 * wrapping the card's React component. This wrapper:
 *
 *   1. Derives `isSelected` / `isEditing` from KoenigSelectedCardContext.
 *   2. Provides those values via CardContext to child components.
 *   3. Registers a NATIVE `mousedown` listener on the CardWrapper DOM
 *      element — NOT a React onMouseDown prop. This is critical because
 *      the mousedown must fire before Lexical's own selection processing.
 *      On first click it selects the card (SELECT_CARD_COMMAND) and sets
 *      `skipClick=true` so the immediately-following CLICK_COMMAND doesn't
 *      jump straight to edit mode.
 *   4. Registers a CLICK_COMMAND handler at editor level. On a second click
 *      of an already-selected card, it enters edit mode (EDIT_CARD_COMMAND)
 *      if the card node has an edit mode.
 *
 * Removed from Koenig: visibility settings, cardWidth logic.
 * Everything else is a line-by-line translation.
 */

export interface KoenigCardWrapperProps {
  nodeKey: string
  wrapperStyle?: CardWrapperStyle
  width?: 'regular'
  children: ReactNode
}

export function KoenigCardWrapper({ nodeKey, wrapperStyle = 'regular', width, children }: KoenigCardWrapperProps) {
  const [editor] = useLexicalComposerContext()
  const [cardType, setCardType] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const skipClick = useRef(false)

  const { selectedCardKey, isEditingCard, isDragging } = useKoenigSelectedCardContext()

  const isSelected = selectedCardKey === nodeKey
  const isEditing = isSelected && isEditingCard

  // --- init: read card type once ---
  useLayoutEffect(() => {
    editor.getEditorState().read(() => {
      const cardNode = $getNodeByKey(nodeKey)
      if (cardNode !== null) {
        setCardType(cardNode.getType())
      }
    })
    // We only do this for init
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- CLICK_COMMAND: enter edit mode on second click ---
  // Registered at editor level (not React level) so we can prevent the
  // editor's default click behaviour without also preventing clicks on
  // other React components inside the card.
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        if (!skipClick.current && containerRef.current?.contains(event.target as Node)) {
          const cardNode = editor.getEditorState().read(() => $getNodeByKey(nodeKey))
          const clickedDifferentEditor = cardNode === null
          const clickedToolbar = (event.target as HTMLElement).closest('[data-kg-allow-clickthrough="false"]')
          const clickedSettingsPanel = (event.target as HTMLElement).closest('[data-kg-settings-panel]')

          const hasEditMode =
            typeof (cardNode as { hasEditMode?: () => boolean })?.hasEditMode === 'function'
              ? (cardNode as { hasEditMode?: () => boolean }).hasEditMode?.()
              : true // default to true so cards without explicit hasEditMode can still enter edit mode

          if (isSelected && hasEditMode && !isEditing && clickedToolbar === null && clickedSettingsPanel === null) {
            editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey, focusEditor: !clickedDifferentEditor })
          } else if (!isSelected) {
            editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey, focusEditor: !clickedDifferentEditor })
          }

          if (clickedDifferentEditor) {
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
    )
  })

  const setEditing = (shouldEdit: boolean) => {
    if (shouldEdit) {
      editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    } else if (!isSelected) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
    }
  }

  // --- mousedown: select card on first click ---
  // NATIVE event listener on the DOM element, NOT a React onMouseDown prop.
  // This ensures correct event ordering relative to Lexical's processing.
  useEffect(() => {
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
        const targetTagName = (event.target as HTMLElement).tagName
        const allowedTagNames = ['INPUT', 'TEXTAREA']
        const allowClickthrough = !!(event.target as HTMLElement).closest('[data-kg-allow-clickthrough]')

        if (!allowedTagNames.includes(targetTagName) && !allowClickthrough) {
          event.preventDefault()
        }
      }
    }

    container?.addEventListener('mousedown', handleMousedown)

    return () => {
      container?.removeEventListener('mousedown', handleMousedown)
    }
  }, [editor, isSelected, isEditing, nodeKey])

  const cardContextValue: CardContextValue = {
    isSelected,
    isEditing,
    setEditing,
    nodeKey,
  }

  return (
    <CardContext.Provider value={cardContextValue}>
      <CardWrapper
        ref={containerRef}
        cardType={cardType ?? undefined}
        isDragging={isDragging}
        isEditing={isEditing}
        isSelected={isSelected}
        wrapperStyle={wrapperStyle}
        width={width}
      >
        {children}
      </CardWrapper>
    </CardContext.Provider>
  )
}
