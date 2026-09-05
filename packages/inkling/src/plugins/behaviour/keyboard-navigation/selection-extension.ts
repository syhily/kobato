import type { LexicalEditor, RangeSelection } from 'lexical'

import { $isDecoratorNode, $isRootNode } from 'lexical'

import { $selectCard } from '../card-adjacency'
import { getEventProvenance } from '../nested-editor-protocol'

// Shift+arrow selection extension — the one home for the root-offset
// anchor/focus arithmetic that carries a range selection across a card
// (decorator) boundary. Lexical does not extend selections over decorator
// nodes on its own, so the arrow-up/arrow-down handlers delegate here before
// their plain-arrow logic; the two directions were ~50-line mirror blocks
// that differ only in sibling direction, line edge, and offset signs — all
// parameterized below. Also home to the caption-provenance escape hatch the
// arrow handlers share (an arrow re-dispatched from a card's caption editor
// reselects the owning card in the parent editor).

export type SelectionExtensionDirection = 'up' | 'down'

/**
 * Extend a range selection one step in `direction`, switching to whole
 * top-level nodes via root element offsets once a card (decorator node) is in
 * or about to enter the selection. Returns true when the extension consumed
 * the event; false means "treat as a normal text selection" and the caller
 * falls through to the browser default.
 */
export function $extendSelectionAcrossCardBoundary(
  direction: SelectionExtensionDirection,
  selection: RangeSelection,
  event: KeyboardEvent,
): boolean {
  let anchorNode = selection.anchor.getNode()

  if (!$isRootNode(anchorNode)) {
    const topLevelAnchor = anchorNode.getTopLevelElement()
    if (!topLevelAnchor) {
      return false
    }
    anchorNode = topLevelAnchor
    const focusNode = selection.focus.getNode().getTopLevelElement()

    const boundarySibling = direction === 'up' ? focusNode?.getPreviousSibling() : focusNode?.getNextSibling()
    // if on or about to move to decorator node selection, select the entire current node using root node offsets
    if (focusNode && boundarySibling && ($isDecoratorNode(anchorNode) || $isDecoratorNode(boundarySibling))) {
      const anchorIndex = anchorNode.getIndexWithinParent()
      const focusIndex = focusNode.getIndexWithinParent()
      if (direction === 'up') {
        // if at the start of the line, treat that line/node as not selected
        if (selection.anchor.offset === 0) {
          selection.focus.set('root', focusIndex - 1, 'element')
          selection.anchor.set('root', anchorIndex, 'element')
        } else {
          selection.focus.set('root', focusIndex, 'element')
          selection.anchor.set('root', anchorIndex + 1, 'element')
        }
      } else {
        // if at end of a line, treat it as if that line/node is not selected
        if (selection.anchor.offset === anchorNode.getTextContentSize()) {
          selection.anchor.set('root', anchorIndex + 1, 'element')
          selection.focus.set('root', focusIndex + 2, 'element')
        } else {
          selection.anchor.set('root', anchorIndex, 'element')
          selection.focus.set('root', focusIndex + 1, 'element')
        }
      }
      event.preventDefault()
      return true
    }
  }

  // if using the root node, simply add the card in the direction of travel
  if ($isRootNode(anchorNode)) {
    const offset = selection.focus.offset
    if (direction === 'up') {
      if (offset > 0) {
        selection.focus.set('root', offset - 1, 'element')
      }
    } else {
      const lastChild = anchorNode.getLastChildOrThrow()
      if (offset <= lastChild.getIndexWithinParent()) {
        selection.focus.set('root', offset + 1, 'element')
      }
    }
    event.preventDefault()
    return true
  }

  return false
}

/**
 * Caption-provenance escape hatch: an arrow event re-dispatched from a card's
 * caption editor moves selection back onto the owning card in the parent
 * editor. Shared verbatim by the arrow-up and arrow-down handlers.
 */
export function $selectCardFromCaptionArrow(
  editor: LexicalEditor,
  selectedCardKey: string | null,
  event: KeyboardEvent | null | undefined,
): boolean {
  if (selectedCardKey && getEventProvenance(event) === 'caption-editor') {
    $selectCard(editor, selectedCardKey)
    return true
  }
  return false
}
