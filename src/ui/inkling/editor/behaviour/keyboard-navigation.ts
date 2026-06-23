import type { LexicalEditor, LexicalNode } from 'lexical'

import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { useEffect } from 'react'

import { $isBlockCardNode, $selectNode } from '@/ui/inkling/editor/behaviour/card-helpers'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

function $isInlineDecoratorNode(node: LexicalNode | null | undefined): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode && node.isInline()
}

function $focusInlineDecoratorFromRange(focusNode: LexicalNode, offset: number, direction: 'left' | 'right'): boolean {
  if ($isTextNode(focusNode)) {
    const textContent = focusNode.getTextContent()
    const atBoundary = direction === 'right' ? offset === textContent.length : offset === 0
    if (!atBoundary) {
      return false
    }
    const neighbor = direction === 'right' ? focusNode.getNextSibling() : focusNode.getPreviousSibling()
    if ($isInlineDecoratorNode(neighbor)) {
      $selectNode(neighbor)
      return true
    }
    return false
  }

  if ($isElementNode(focusNode)) {
    const child = focusNode.getChildAtIndex(direction === 'right' ? offset : offset - 1)
    if ($isInlineDecoratorNode(child)) {
      $selectNode(child)
      return true
    }
    return false
  }

  return false
}

function $focusBlockCardFromRange(focusNode: LexicalNode, offset: number, direction: 'up' | 'down'): boolean {
  let paragraph: LexicalNode | null = null
  let paragraphOffset = -1

  if ($isParagraphNode(focusNode)) {
    paragraph = focusNode
    paragraphOffset = offset
  } else if ($isTextNode(focusNode)) {
    const textContent = focusNode.getTextContent()
    const parent = focusNode.getParent()
    if (!$isParagraphNode(parent)) {
      return false
    }
    if (direction === 'down' && offset === textContent.length && focusNode.getNextSibling() === null) {
      paragraph = parent
      paragraphOffset = focusNode.getIndexWithinParent() + 1
    } else if (direction === 'up' && offset === 0 && focusNode.getPreviousSibling() === null) {
      paragraph = parent
      paragraphOffset = focusNode.getIndexWithinParent()
    } else {
      return false
    }
  }

  if (paragraph === null || !$isParagraphNode(paragraph) || paragraphOffset < 0) {
    return false
  }

  if (direction === 'down') {
    const childSize = paragraph.getChildrenSize()
    if (paragraphOffset !== childSize) {
      return false
    }
    const nextSibling = paragraph.getNextSibling()
    if (nextSibling !== null && $isBlockCardNode(nextSibling)) {
      $selectNode(nextSibling)
      return true
    }
    return false
  }

  if (paragraphOffset !== 0) {
    return false
  }
  const previousSibling = paragraph.getPreviousSibling()
  if (previousSibling !== null && $isBlockCardNode(previousSibling)) {
    $selectNode(previousSibling)
    return true
  }
  return false
}

function $moveFromNodeSelection(direction: 'left' | 'right' | 'up' | 'down'): boolean {
  const selection = $getSelection()
  if (!$isNodeSelection(selection)) {
    return false
  }
  const nodes = selection.getNodes()
  const node = nodes[0]
  if (node === undefined) {
    return false
  }

  if ($isInlineDecoratorNode(node)) {
    if (direction === 'left') {
      node.selectPrevious()
      return true
    }
    if (direction === 'right') {
      node.selectNext()
      return true
    }
    return false
  }

  if ($isBlockCardNode(node)) {
    if (direction === 'up' || direction === 'left') {
      const previousSibling = node.getPreviousSibling()
      if ($isElementNode(previousSibling)) {
        previousSibling.select()
        return true
      }
      if ($isTextNode(previousSibling)) {
        previousSibling.select()
        return true
      }
      return false
    }
    if (direction === 'down' || direction === 'right') {
      const nextSibling = node.getNextSibling()
      if ($isElementNode(nextSibling)) {
        nextSibling.select(0, 0)
        return true
      }
      if ($isTextNode(nextSibling)) {
        nextSibling.select(0, 0)
        return true
      }
      return false
    }
  }

  return false
}

function $deleteSelectedDecorator(): boolean {
  const selection = $getSelection()
  if (!$isNodeSelection(selection)) {
    return false
  }
  const nodes = selection.getNodes()
  const node = nodes[0]
  if (node === undefined) {
    return false
  }
  if (!$isDecoratorNode(node)) {
    return false
  }

  const previousSibling = node.getPreviousSibling()
  const nextSibling = node.getNextSibling()
  node.remove()

  if (previousSibling !== null) {
    if ($isTextNode(previousSibling)) {
      previousSibling.select()
      return true
    }
    if ($isElementNode(previousSibling)) {
      const lastChild = previousSibling.getLastChild()
      if ($isTextNode(lastChild)) {
        const length = lastChild.getTextContent().length
        lastChild.select(length, length)
      } else {
        const childSize = previousSibling.getChildrenSize()
        previousSibling.select(childSize, childSize)
      }
      return true
    }
  }
  if (nextSibling !== null) {
    if ($isTextNode(nextSibling)) {
      nextSibling.select(0, 0)
      return true
    }
    if ($isElementNode(nextSibling)) {
      nextSibling.select(0, 0)
      return true
    }
  }

  const root = $getRoot()
  const paragraph = $createParagraphNode()
  root.append(paragraph)
  paragraph.select(0, 0)
  return true
}

function $insertParagraphAfterSelectedCard(): boolean {
  const selection = $getSelection()
  if (!$isNodeSelection(selection)) {
    return false
  }
  const nodes = selection.getNodes()
  const node = nodes[0]
  if (!$isBlockCardNode(node)) {
    return false
  }
  const paragraph = $createParagraphNode()
  node.insertAfter(paragraph)
  paragraph.select(0, 0)
  return true
}

/**
 * When Backspace is pressed at the start of an empty paragraph whose previous
 * sibling is a card, select the card instead of deleting the paragraph. This
 * avoids accumulating empty paragraphs between cards and gives the user a
 * natural way to navigate back into a card to edit it.
 *
 * Mirrors Koenig's `$deselectCard` / backspace-into-card behaviour.
 */
function $selectPreviousCardFromEmptyParagraph(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0) {
    return false
  }
  const node = selection.anchor.getNode()
  // The anchor may be the paragraph itself or a text node inside it.
  const paragraph = $isElementNode(node) && node.getType() === 'paragraph' ? node : node.getParent()
  if (paragraph === null || paragraph.getType() !== 'paragraph' || paragraph.getTextContent().length > 0) {
    return false
  }
  const previous = paragraph.getPreviousSibling()
  if (previous === null || !$isBlockCardNode(previous)) {
    return false
  }
  // Select the card itself (NodeSelection) rather than calling the base
  // `selectPrevious()`, which would move the caret to the node's previous
  // sibling — i.e. navigate past the card instead of selecting it. This
  // makes Backspace from an empty paragraph adjacent to a card select the
  // card (so a second Backspace deletes it), matching the function name
  // and the docstring above. Same primitive used by `$deleteSelectedDecorator`.
  $selectNode(previous)
  return true
}

/**
 * Symmetric to `$selectPreviousCardFromEmptyParagraph` for forward-delete.
 */
function $selectNextCardFromEmptyParagraph(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  const node = selection.anchor.getNode()
  const paragraph = $isElementNode(node) && node.getType() === 'paragraph' ? node : node.getParent()
  if (paragraph === null || paragraph.getType() !== 'paragraph') {
    return false
  }
  // Caret must be at the end of the paragraph's last text child.
  const text = paragraph.getTextContent()
  if (selection.anchor.offset !== text.length) {
    return false
  }
  if (text.length > 0) {
    return false
  }
  const next = paragraph.getNextSibling()
  if (next === null || !$isBlockCardNode(next)) {
    return false
  }
  // See `$selectPreviousCardFromEmptyParagraph` — `selectPrevious()` would
  // move the caret rather than entering NodeSelection on the card.
  $selectNode(next)
  return true
}

function $exitCardSelectionMode(): boolean {
  const selection = $getSelection()
  if (!$isNodeSelection(selection)) {
    return false
  }
  const nodes = selection.getNodes()
  const node = nodes[0]
  if (!$isBlockCardNode(node)) {
    return false
  }
  const nextSibling = node.getNextSibling()
  if ($isElementNode(nextSibling) || $isTextNode(nextSibling)) {
    nextSibling.select(0, 0)
    return true
  }
  const previousSibling = node.getPreviousSibling()
  if ($isElementNode(previousSibling) || $isTextNode(previousSibling)) {
    previousSibling.select()
    return true
  }
  const paragraph = $createParagraphNode()
  node.insertAfter(paragraph)
  paragraph.select(0, 0)
  return true
}

export function registerInklingKeyboardNavigation(editor: LexicalEditor): () => void {
  const unregisterArrowLeft = editor.registerCommand(
    KEY_ARROW_LEFT_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      const selection = $getSelection()
      if ($isNodeSelection(selection)) {
        return $moveFromNodeSelection('left')
      }
      if ($isRangeSelection(selection)) {
        const focus = selection.focus
        return $focusInlineDecoratorFromRange(focus.getNode(), focus.offset, 'left')
      }
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterArrowRight = editor.registerCommand(
    KEY_ARROW_RIGHT_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      const selection = $getSelection()
      if ($isNodeSelection(selection)) {
        return $moveFromNodeSelection('right')
      }
      if ($isRangeSelection(selection)) {
        const focus = selection.focus
        return $focusInlineDecoratorFromRange(focus.getNode(), focus.offset, 'right')
      }
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterArrowUp = editor.registerCommand(
    KEY_ARROW_UP_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      const selection = $getSelection()
      if ($isNodeSelection(selection)) {
        return $moveFromNodeSelection('up')
      }
      if ($isRangeSelection(selection)) {
        const focus = selection.focus
        return $focusBlockCardFromRange(focus.getNode(), focus.offset, 'up')
      }
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterArrowDown = editor.registerCommand(
    KEY_ARROW_DOWN_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      const selection = $getSelection()
      if ($isNodeSelection(selection)) {
        return $moveFromNodeSelection('down')
      }
      if ($isRangeSelection(selection)) {
        const focus = selection.focus
        return $focusBlockCardFromRange(focus.getNode(), focus.offset, 'down')
      }
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterBackspace = editor.registerCommand(
    KEY_BACKSPACE_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      // First: if a card is selected, delete it.
      if ($deleteSelectedDecorator()) {
        return true
      }
      // Second: if the caret is at the start of an empty paragraph whose
      // previous sibling is a card, select the card instead of deleting the
      // empty paragraph. This mirrors Koenig's "backspace into card" behaviour
      // and lets the user navigate back into cards without leaving stray
      // empty paragraphs between them.
      return $selectPreviousCardFromEmptyParagraph()
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterDelete = editor.registerCommand(
    KEY_DELETE_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      if ($deleteSelectedDecorator()) {
        return true
      }
      // Symmetric: forward-delete at the end of an empty paragraph whose next
      // sibling is a card selects that card.
      return $selectNextCardFromEmptyParagraph()
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterEnter = editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      return $insertParagraphAfterSelectedCard()
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  const unregisterEscape = editor.registerCommand(
    KEY_ESCAPE_COMMAND,
    (event) => {
      if (event !== null && event.defaultPrevented) {
        return false
      }
      return $exitCardSelectionMode()
    },
    COMMAND_PRIORITY_CRITICAL,
  )

  // Card click-to-select is now handled by CardCommandsPlugin (Koenig's
  // command-driven approach via KoenigCardWrapper → SELECT_CARD_COMMAND).

  return () => {
    unregisterArrowLeft()
    unregisterArrowRight()
    unregisterArrowUp()
    unregisterArrowDown()
    unregisterBackspace()
    unregisterDelete()
    unregisterEnter()
    unregisterEscape()
  }
}

export function useInklingKeyboardNavigation(editor: LexicalEditor | null): void {
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return registerInklingKeyboardNavigation(editor)
  }, [editor])
}
