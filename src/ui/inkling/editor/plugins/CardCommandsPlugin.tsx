import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isDecoratorNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import { useEffect } from 'react'

import { useKoenigSelectedCardContext } from '@/ui/inkling/context/KoenigSelectedCardContext'
import { DELETE_CARD_COMMAND, EDIT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/ui/inkling/editor/commands'

/**
 * Headless plugin that handles card interaction commands.
 *
 * Ported from Koenig's KoenigBehaviourPlugin — the SELECT_CARD_COMMAND /
 * EDIT_CARD_COMMAND / DELETE_CARD_COMMAND handlers. This replaces inkling's
 * old `card-click-selection.ts` (which had a `readEditor` active-editor bug)
 * with Koenig's command-driven approach:
 *
 *   1. KoenigCardWrapper dispatches SELECT_CARD_COMMAND / EDIT_CARD_COMMAND
 *      on click/mousedown.
 *   2. This plugin handles them: sets a Lexical NodeSelection (so keyboard
 *      nav / delete works) AND updates the KoenigSelectedCardContext React
 *      state (so KoenigCardWrapper re-renders with isSelected/isEditing).
 *
 * Mount this inside a `<LexicalComposer>` that is also wrapped by
 * `KoenigSelectedCardContextProvider`.
 */
function $selectCard(editor: LexicalEditor, nodeKey: string): void {
  const selection = $createNodeSelection()
  selection.add(nodeKey)
  $setSelection(selection)
  // Selecting a decorator node doesn't change the DOM selection (there's no
  // caret), so we manually move focus to the editor element to keep keyboard
  // events routed correctly.
  const rootElement = editor.getRootElement()
  if (document.activeElement !== rootElement) {
    rootElement?.focus({ preventScroll: true })
  }
}

/** Koenig card nodes optionally implement these methods. They're not on the
 *  Lexical base class — they're added by KoenigDecoratorNode subclasses. We
 *  duck-type them so any card node that doesn't implement them simply skips
 *  the behaviour. */
interface KoenigCardExtensions {
  isEmpty?: () => boolean
  hasEditMode?: () => boolean
}

function asKoenigCard(node: ReturnType<typeof $getNodeByKey>): NonNullable<typeof node> & KoenigCardExtensions {
  return node as NonNullable<typeof node> & KoenigCardExtensions
}

/** Remove an empty card when it's deselected (mirrors Koenig's $deselectCard). */
function $deselectCard(nodeKey: string): void {
  const cardNode = $getNodeByKey(nodeKey)
  if (cardNode !== null && asKoenigCard(cardNode).isEmpty?.() === true) {
    $removeOrReplaceNodeWithParagraph(cardNode)
  }
}

/** Delete or replace a card node with a paragraph (mirrors Koenig). */
function $removeOrReplaceNodeWithParagraph(node: NonNullable<ReturnType<typeof $getNodeByKey>>): void {
  const root = $getRoot()
  if (root.getLastChild()?.is(node) === true) {
    const paragraph = $createParagraphNode()
    root.append(paragraph)
    paragraph.select()
  } else {
    const nextNode = node.getNextSibling()
    if (nextNode !== null && $isDecoratorNode(nextNode)) {
      const selection = $createNodeSelection()
      selection.add(nextNode.getKey())
      $setSelection(selection)
    } else if (nextNode?.selectStart !== undefined) {
      nextNode.selectStart()
    } else {
      node.selectNext()
    }
  }
  node.remove()
}

export function CardCommandsPlugin(): null {
  const [editor] = useLexicalComposerContext()
  const { selectedCardKey, setSelectedCardKey, isEditingCard, setIsEditingCard } = useKoenigSelectedCardContext()

  useEffect(() => {
    return editor.registerCommand(
      SELECT_CARD_COMMAND,
      ({ cardKey }) => {
        // Already selected and in edit mode — if the card is empty, delete it
        // (user clicked away from an empty card).
        if (selectedCardKey === cardKey && isEditingCard) {
          editor.update(
            () => {
              const cardNode = $getNodeByKey(cardKey)
              if (cardNode !== null && asKoenigCard(cardNode).isEmpty?.() === true) {
                $removeOrReplaceNodeWithParagraph(cardNode)
              }
            },
            { tag: 'history-merge' },
          )
        }

        if (selectedCardKey !== null && selectedCardKey !== cardKey) {
          editor.update(() => $deselectCard(selectedCardKey), { tag: 'history-merge' })
        }

        editor.update(
          () => {
            $selectCard(editor, cardKey)
          },
          { tag: 'history-merge' },
        )

        setSelectedCardKey(cardKey)
        setIsEditingCard(false)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, selectedCardKey, isEditingCard, setSelectedCardKey, setIsEditingCard])

  useEffect(() => {
    return editor.registerCommand(
      EDIT_CARD_COMMAND,
      ({ cardKey }) => {
        if (selectedCardKey !== null && selectedCardKey !== cardKey) {
          editor.update(() => $deselectCard(selectedCardKey), { tag: 'history-merge' })
        }
        editor.update(
          () => {
            $selectCard(editor, cardKey)
          },
          { tag: 'history-merge' },
        )
        setSelectedCardKey(cardKey)

        editor.getEditorState().read(() => {
          const cardNode = $getNodeByKey(cardKey)
          if (asKoenigCard(cardNode).hasEditMode?.() === true) {
            setIsEditingCard(true)
          }
        })
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, selectedCardKey, setSelectedCardKey, setIsEditingCard])

  useEffect(() => {
    return editor.registerCommand(
      DELETE_CARD_COMMAND,
      () => {
        if (selectedCardKey === null) {
          return false
        }
        editor.update(
          () => {
            const cardNode = $getNodeByKey(selectedCardKey)
            if (cardNode === null) {
              return
            }
            $removeOrReplaceNodeWithParagraph(cardNode)
          },
          { tag: 'history-merge' },
        )
        editor.getRootElement()?.focus()
        setSelectedCardKey(null)
        setIsEditingCard(false)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, selectedCardKey, setSelectedCardKey, setIsEditingCard])

  return null
}
