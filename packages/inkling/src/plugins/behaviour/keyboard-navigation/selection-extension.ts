import type { LexicalEditor, RangeSelection } from 'lexical'

import { $selectCard } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { getEventProvenance } from '@kobato/inkling-internal/plugins/behaviour/nested-editor-protocol'
import { $isDecoratorNode, $isRootNode } from 'lexical'

// Shift+arrow selection extension: the one home for the root-offset anchor/focus
// arithmetic that carries a range selection across a card (decorator) boundary.
// Lexical does not extend selections over decorator nodes on its own. Also home to
// the caption-provenance escape hatch shared by the arrow handlers.

export type SelectionExtensionDirection = 'up' | 'down'

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

    if (focusNode && boundarySibling && ($isDecoratorNode(anchorNode) || $isDecoratorNode(boundarySibling))) {
      const anchorIndex = anchorNode.getIndexWithinParent()
      const focusIndex = focusNode.getIndexWithinParent()
      if (direction === 'up') {
        if (selection.anchor.offset === 0) {
          selection.focus.set('root', focusIndex - 1, 'element')
          selection.anchor.set('root', anchorIndex, 'element')
        } else {
          selection.focus.set('root', focusIndex, 'element')
          selection.anchor.set('root', anchorIndex + 1, 'element')
        }
      } else {
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
