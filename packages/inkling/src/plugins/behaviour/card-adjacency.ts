import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import type { DecoratorNode, LexicalEditor, LexicalNode } from 'lexical'

import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { DELETE_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { $isAtTopOfNode, $selectDecoratorNode, getTopLevelNativeElement } from '@kobato/inkling-internal/utils'
import { $ensureParagraphAfterCard } from '@kobato/inkling-internal/utils/$ensureParagraphAfterCard'
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

export const RANGE_TO_ELEMENT_BOUNDARY_THRESHOLD_PX = 10

export interface CardAdjacencyGeometry {
  hasNativeSelection(): boolean

  getCaretClientRects(): ArrayLike<DOMRect>

  getTopLevelBlockRect(): DOMRect | null

  isCaretAtBlockTop(): boolean

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
  const rangeRect = rects.length > 1 ? rects[1] : rects[0]
  const elemRect = geometry.getTopLevelBlockRect()
  if (!elemRect) {
    return null
  }
  return Math.abs(rangeRect.bottom - elemRect.bottom) < RANGE_TO_ELEMENT_BOUNDARY_THRESHOLD_PX ? sibling : null
}

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

export type EmptyBlockCheck = 'paragraph-is-empty' | 'from-mode-blank'

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

export function $isCaretAtBlockTop(geometry: CardAdjacencyGeometry = defaultCardAdjacencyGeometry): boolean {
  return geometry.isCaretAtBlockTop()
}

export function editorOwnsFocus(editor: LexicalEditor): boolean {
  return document.activeElement === editor.getRootElement()
}

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

export function focusEditorRoot(editor: LexicalEditor): void {
  editor.getRootElement()?.focus({ preventScroll: true })
}

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

export function $deselectCard(editor: LexicalEditor, nodeKey: string) {
  const cardNode = $getNodeByKey(nodeKey)
  if (cardNode && $isInklingCard(cardNode) && cardNode.isEmpty?.()) {
    $removeOrReplaceNodeWithParagraph(editor, cardNode)
  }
}

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
