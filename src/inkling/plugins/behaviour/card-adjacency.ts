import type { DecoratorNode, LexicalEditor, LexicalNode } from 'lexical'

import {
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
} from 'lexical'

import type { CardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'

import { $isInklingCard } from '@/inkling/nodes/base'
import { DELETE_CARD_COMMAND } from '@/inkling/plugins/behaviour/commands'
import { $isAtTopOfNode, $selectDecoratorNode, getTopLevelNativeElement } from '@/inkling/utils'
import { $ensureParagraphAfterCard } from '@/inkling/utils/$ensureParagraphAfterCard'

export const RANGE_TO_ELEMENT_BOUNDARY_THRESHOLD_PX = 10

// Two adjacency notions: visual (caret geometry, arrow keys) and logical
// (anchor offset, backspace/delete); they deliberately do not share a derivation.

/**
 * Geometry seam for the adjacency queries: the default implementation does the
 * real DOM reads, tests inject a fake. Exported for tests only.
 */
export interface CardAdjacencyGeometry {
  /** Whether a native window selection exists at all (arrow down bails out before its shortcuts when it doesn't). */
  hasNativeSelection(): boolean
  /** Client rects of the caret's native range; empty when the caret has no rendered rect (e.g. empty paragraphs). */
  getCaretClientRects(): ArrayLike<DOMRect>
  /** Bounding rect of the top-level block element containing the caret. */
  getTopLevelBlockRect(): DOMRect | null
  /** Whether the caret sits on the first visual line of its block. */
  isCaretAtBlockTop(): boolean
  /** Whether the native caret sits at the end of its top-level block element. */
  isCaretAtBlockEnd(): boolean
}

const defaultCardAdjacencyGeometry: CardAdjacencyGeometry = {
  hasNativeSelection() {
    return window.getSelection() !== null
  },
  getCaretClientRects() {
    const nativeSelection = window.getSelection()
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      return []
    }
    return nativeSelection.getRangeAt(0).cloneRange().getClientRects()
  },
  getTopLevelBlockRect() {
    const nativeTopLevelElement = getTopLevelNativeElement(window.getSelection()?.anchorNode ?? null)
    return nativeTopLevelElement ? nativeTopLevelElement.getBoundingClientRect() : null
  },
  isCaretAtBlockTop() {
    const nativeSelection = window.getSelection()
    if (!nativeSelection) {
      return false
    }
    return $isAtTopOfNode(nativeSelection, RANGE_TO_ELEMENT_BOUNDARY_THRESHOLD_PX) ?? false
  },
  isCaretAtBlockEnd() {
    const nativeSelection = window.getSelection()
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      return false
    }
    const nativeTopLevelElement = getTopLevelNativeElement(nativeSelection.anchorNode)
    return (
      nativeTopLevelElement !== null &&
      nativeSelection.anchorNode === nativeTopLevelElement &&
      nativeSelection.anchorOffset === nativeTopLevelElement.children.length - 1 &&
      nativeSelection.focusOffset === nativeTopLevelElement.children.length - 1
    )
  },
}

/**
 * Visual adjacency: the card rendered immediately above ('up') or below
 * ('down') the caret, when the caret is visually at the boundary of its
 * top-level block. Includes the arrow keys' empty-paragraph/offset shortcuts
 * (an empty paragraph has no caret rect).
 */
export function $getVisuallyAdjacentCard(
  direction: 'up' | 'down',
  geometry: CardAdjacencyGeometry = defaultCardAdjacencyGeometry,
): DecoratorNode<unknown> | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null
  }
  const topLevelElement = selection.anchor.getNode().getTopLevelElement()
  if (!topLevelElement) {
    return null
  }
  const sibling = direction === 'up' ? topLevelElement.getPreviousSibling() : topLevelElement.getNextSibling()
  if (!$isDecoratorNode(sibling)) {
    return null
  }

  const onEmptyNode = topLevelElement.getTextContent().trim() === '' && selection.anchor.offset === 0

  if (direction === 'up') {
    const atStartOfElement = selection.anchor.offset === 0 && selection.focus.offset === 0
    if (onEmptyNode || atStartOfElement) {
      return sibling
    }
    return geometry.isCaretAtBlockTop() ? sibling : null
  }

  if (!geometry.hasNativeSelection()) {
    return null
  }
  const atEndOfElement = geometry.isCaretAtBlockEnd()
  if (onEmptyNode || atEndOfElement) {
    return sibling
  }
  const rects = geometry.getCaretClientRects()
  if (rects.length === 0) {
    return null
  }
  // A caret at a line start/end yields two rects; use the second (new line) to test for a card below.
  const rangeRect = rects.length > 1 ? rects[1] : rects[0]
  const elemRect = geometry.getTopLevelBlockRect()
  if (!elemRect) {
    return null
  }
  return Math.abs(rangeRect.bottom - elemRect.bottom) < RANGE_TO_ELEMENT_BOUNDARY_THRESHOLD_PX ? sibling : null
}

/**
 * Logical adjacency: the card immediately before ('previous') or after ('next')
 * a reference point in document order. Without `from` the reference is the
 * collapsed range selection, gated on the anchor sitting at the boundary of its
 * top-level element; with `from` the sibling lookup is ungated.
 */
export function $getLogicallyAdjacentCard(
  direction: 'previous' | 'next',
  from?: LexicalNode,
): DecoratorNode<unknown> | null {
  if (from) {
    return getCardSibling(from, direction)
  }
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null
  }
  const anchor = selection.anchor
  const anchorNode = anchor.getNode()
  const topLevelElement = anchorNode.getTopLevelElement()
  if (!topLevelElement) {
    return null
  }

  const atBoundary =
    direction === 'previous'
      ? anchor.offset === 0 && selection.focus.offset === 0
      : (anchor.type === 'element' && $isElementNode(anchorNode) && anchor.offset === anchorNode.getChildrenSize()) ||
        (anchor.type === 'text' &&
          anchor.offset === anchorNode.getTextContentSize() &&
          anchorNode.getParent()?.getLastChild()?.is(anchorNode))
  if (!atBoundary) {
    return null
  }
  return getCardSibling(topLevelElement, direction)
}

function getCardSibling(node: LexicalNode, direction: 'previous' | 'next'): DecoratorNode<unknown> | null {
  const sibling = direction === 'previous' ? node.getPreviousSibling() : node.getNextSibling()
  return $isDecoratorNode(sibling) ? sibling : null
}

/**
 * The "key eats the adjacent card, the caret stays put" surgery: remove the card
 * logically before ('previous', backspace) or after ('next', forward delete) the
 * collapsed caret. 'previous' needs two extra guards: the anchor's parent must BE
 * the top-level element (lists) and the anchor must be its first child
 * (LinkNode/HorizontalRule children). Returns true when a card was removed.
 */
export function $removeLogicallyAdjacentCard(direction: 'previous' | 'next'): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  const anchorNode = selection.anchor.getNode()

  if (direction === 'previous') {
    const topLevelElement = anchorNode.getTopLevelElement()
    if (!topLevelElement) {
      return false
    }
    const anchorNodeParent = anchorNode.getParent()
    if (anchorNodeParent !== topLevelElement || !anchorNodeParent?.getFirstChild()?.is(anchorNode)) {
      return false
    }
  }

  const card = $getLogicallyAdjacentCard(direction)
  if (!card) {
    return false
  }
  card.remove()
  return true
}

/**
 * How the empty-block surgery reads emptiness (a deliberate divergence):
 * 'paragraph-is-empty' (backspace) requires the anchor itself to be an empty
 * ParagraphNode; 'from-mode-blank' (forward delete) requires blank top-level
 * text with the caret at offset 0, because selection-mode's 'next' boundary
 * needs an element anchor at getChildrenSize(), which a whitespace-only block
 * with zero-text children (a lone LineBreakNode) does not satisfy.
 */
export type EmptyBlockCheck = 'paragraph-is-empty' | 'from-mode-blank'

/** Removes the caret's top-level block when `check` judges it empty and selects the adjacent card. */
export function $removeEmptyBlockAndSelectCard(direction: 'previous' | 'next', check: EmptyBlockCheck): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  const anchorNode = selection.anchor.getNode()
  const topLevelElement = anchorNode.getTopLevelElement()
  if (!topLevelElement) {
    return false
  }

  const isEmpty =
    check === 'paragraph-is-empty'
      ? $isParagraphNode(anchorNode) && anchorNode.isEmpty()
      : topLevelElement.getTextContent().trim() === '' && selection.anchor.offset === 0
  if (!isEmpty) {
    return false
  }

  const card = $getLogicallyAdjacentCard(direction, topLevelElement)
  if (!card) {
    return false
  }
  topLevelElement.remove()
  $selectDecoratorNode(card)
  return true
}

/** First-visual-line verdict through the geometry seam (delete-line's isFirstLine check). */
export function $isCaretAtBlockTop(geometry: CardAdjacencyGeometry = defaultCardAdjacencyGeometry): boolean {
  return geometry.isCaretAtBlockTop()
}

/** Shared "editor root has focus" guard for the behaviour handlers. */
export function editorOwnsFocus(editor: LexicalEditor): boolean {
  return document.activeElement === editor.getRootElement()
}

/**
 * The "selected card eats the destructive key" gate shared by the
 * backspace/delete/delete-line handlers: while the editor owns focus and a
 * top-level card is selected, the key deletes the card. Each handler keeps its
 * own focus-swallow policy. Returns true when the key was claimed.
 */
export function dispatchSelectedCardDeletion(
  editor: LexicalEditor,
  store: CardSelectionStore,
  isNested: boolean | undefined,
  direction: 'backward' | 'forward',
  event?: KeyboardEvent | null,
): boolean {
  const { selectedCardKey } = store.getState()
  if (isNested || !selectedCardKey || !editorOwnsFocus(editor)) {
    return false
  }
  event?.preventDefault()
  editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: selectedCardKey, direction })
  return true
}

/**
 * Focus the editor's root element by hand — the focus repair after selecting
 * chrome-less UI or before a card's chrome dismounts. `preventScroll` matters:
 * repair must not yank the viewport.
 */
export function focusEditorRoot(editor: LexicalEditor): void {
  editor.getRootElement()?.focus({ preventScroll: true })
}

/**
 * Focus repair after selecting a card: a decorator selection has no caret, so
 * focus must go to the editor element by hand. 'if-blurred' (default) serves
 * pointer-driven selection; 'always' when the caller just removed the focused
 * card's chrome or a headless host asked for focus; 'never' when the caller
 * already owns focus or repaired it.
 */
export type CardSelectionFocus = 'if-blurred' | 'always' | 'never'

export function $selectCard(
  editor: LexicalEditor,
  nodeOrKey: LexicalNode | string,
  { focus = 'if-blurred' }: { focus?: CardSelectionFocus } = {},
) {
  const selection = $createNodeSelection()
  selection.add(typeof nodeOrKey === 'string' ? nodeOrKey : nodeOrKey.getKey())
  $setSelection(selection)
  const rootElement = editor.getRootElement()
  if (rootElement && (focus === 'always' || (focus === 'if-blurred' && !editorOwnsFocus(editor)))) {
    focusEditorRoot(editor)
  }
}

// Remove empty cards on deselect; cards without isEmpty are never auto-removed.
export function $deselectCard(editor: LexicalEditor, nodeKey: string) {
  const cardNode = $getNodeByKey(nodeKey)
  if (cardNode && $isInklingCard(cardNode) && cardNode.isEmpty?.()) {
    $removeOrReplaceNodeWithParagraph(editor, cardNode)
  }
}

/**
 * Focus choreography of $removeOrReplaceNodeWithParagraph: 'decorator-next'
 * (default) moves focus to the root element only when the next sibling is a
 * decorator, since selecting one leaves no caret to carry focus; 'root-first'
 * (ctrl/cmd+Enter leaving edit mode) returns focus to the editor BEFORE the
 * card's chrome unmounts — otherwise it stays on removed elements and swallows
 * further key events.
 */
export type CardRemovalFocus = 'decorator-next' | 'root-first'

export function $removeOrReplaceNodeWithParagraph(
  editor: LexicalEditor,
  node: LexicalNode,
  { focus = 'decorator-next' }: { focus?: CardRemovalFocus } = {},
) {
  if (focus === 'root-first') {
    focusEditorRoot(editor)
  }

  if ($getRoot().getLastChild()?.is(node)) {
    $ensureParagraphAfterCard(node, { select: true })
  } else {
    const nextNode = node.getNextSibling()
    if (nextNode && $isDecoratorNode(nextNode)) {
      $selectCard(editor, nextNode, { focus: focus === 'decorator-next' ? 'always' : 'never' })
    } else {
      nextNode?.selectStart()
    }
  }

  node.remove()
}
