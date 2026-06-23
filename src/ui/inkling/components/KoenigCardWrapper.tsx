import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { CLICK_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import { CardWrapper, type CardWrapperStyle } from '@/ui/inkling/components/ui/CardWrapper'
import CardContext, { type CardContextValue } from '@/ui/inkling/context/CardContext'
import { useKoenigSelectedCardContext } from '@/ui/inkling/context/KoenigSelectedCardContext'
import { EDIT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/ui/inkling/editor/commands'

/**
 * Card connector — ported from Koenig's KoenigCardWrapper.jsx.
 *
 * Every card node's `decorate()` returns `<KoenigCardWrapper nodeKey={...}>`
 * wrapping the card's React component. This wrapper:
 *
 *   1. Derives `isSelected` / `isEditing` from KoenigSelectedCardContext.
 *   2. Provides those values via CardContext to child components.
 *   3. Registers a `mousedown` handler on its container — first click
 *      selects the card (dispatches SELECT_CARD_COMMAND); a second click on
 *      an already-selected card enters edit mode (dispatches
 *      EDIT_CARD_COMMAND).
 *   4. Registers a CLICK_COMMAND handler so Lexical knows the card was
 *      interacted with (prevents the editor from collapsing the selection).
 *
 * Removed from Koenig: visibility settings, snippet, wide/full card width.
 */

export interface KoenigCardWrapperProps {
  nodeKey: string
  wrapperStyle?: CardWrapperStyle
  width?: 'regular'
  children: ReactNode
}

export function KoenigCardWrapper({ nodeKey, wrapperStyle = 'regular', width, children }: KoenigCardWrapperProps) {
  const [editor] = useLexicalComposerContext()
  const { selectedCardKey, isEditingCard, isDragging, setSelectedCardKey, setIsEditingCard } =
    useKoenigSelectedCardContext()

  const containerRef = useRef<HTMLDivElement>(null)
  // Prevents the CLICK_COMMAND that follows mousedown from immediately
  // entering edit mode — the user should see the selection ring first, then
  // click again to edit.
  const skipClickRef = useRef(false)

  const isSelected = selectedCardKey === nodeKey
  const isEditing = isSelected && isEditingCard

  const setEditing = useCallback(
    (shouldEdit: boolean) => {
      if (shouldEdit) {
        editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
      } else {
        setSelectedCardKey(nodeKey)
        setIsEditingCard(false)
        editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
      }
    },
    [editor, nodeKey, setSelectedCardKey, setIsEditingCard],
  )

  // --- mousedown: select card on first click ---
  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (editor.isComposing()) {
        return
      }

      const target = event.target as HTMLElement
      // Let clicks on interactive elements (inputs, buttons, textareas,
      // selects, links) pass through without triggering selection — the
      // user is interacting with the card's controls.
      if (target.closest('input, textarea, button, select, a, [contenteditable="true"]')) {
        return
      }

      if (!isSelected) {
        // First click: select the card
        skipClickRef.current = true
        event.preventDefault()
        editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey, focusEditor: false })
      }
    },
    [editor, isSelected, nodeKey],
  )

  // --- CLICK_COMMAND: enter edit mode on second click ---
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, button, select, a, [contenteditable="true"]')) {
          return false
        }

        const cardDOM = containerRef.current
        if (cardDOM === null) {
          return false
        }
        if (!cardDOM.contains(target)) {
          return false
        }

        if (skipClickRef.current) {
          // This click is the one that immediately followed the mousedown
          // selection — consume it so we don't jump straight to edit mode.
          skipClickRef.current = false
          return true
        }

        if (isSelected && !isEditing) {
          // Second click on an already-selected card → enter edit mode
          editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey, focusEditor: false })
          return true
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor, isSelected, isEditing, nodeKey])

  const cardContextValue: CardContextValue = {
    isSelected,
    isEditing,
    setEditing,
    nodeKey,
  }

  return (
    <CardContext.Provider value={cardContextValue}>
      <div ref={containerRef} onMouseDown={handleMouseDown}>
        <CardWrapper isSelected={isSelected} isDragging={isDragging} wrapperStyle={wrapperStyle} width={width}>
          {children}
        </CardWrapper>
      </div>
    </CardContext.Provider>
  )
}
