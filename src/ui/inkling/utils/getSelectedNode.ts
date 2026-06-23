import { $isRangeSelection, type RangeSelection } from 'lexical'

/**
 * Get the node at the current selection anchor — ported from Koenig's
 * getSelectedNode.js.
 *
 * If the anchor offset is 0, returns the previous sibling (so we detect
 * when the cursor is at the start of a text node that follows a link or
 * other inline element).
 */
export function getSelectedNode(selection: RangeSelection) {
  const anchor = selection.anchor
  const focus = selection.focus
  const anchorNode = anchor.getNode()
  const focusNode = focus.getNode()

  if (anchorNode === focusNode) {
    return anchorNode
  }

  const isBackward = selection.isBackward()
  if (isBackward) {
    return $isAtNodeEnd(focus) ? getPreviousSibling(focusNode) : focusNode
  }
  return $isAtNodeEnd(anchor) ? getPreviousSibling(anchorNode) : anchorNode
}

function $isAtNodeEnd(selection: { type: string; offset: number; getNode: () => { getTextContentSize?: () => number; getPreviousSibling: () => unknown } }) {
  if (selection.type === 'text') {
    const node = selection.getNode()
    const textContentSize = node.getTextContentSize?.() ?? 0
    return selection.offset === textContentSize
  }
  return false
}

function getPreviousSibling(node: { getPreviousSibling: () => unknown }) {
  return node.getPreviousSibling() as unknown as ReturnType<RangeSelection['anchor']['getNode']>
}
