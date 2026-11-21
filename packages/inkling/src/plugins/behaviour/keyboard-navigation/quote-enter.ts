import type { LexicalEditor } from 'lexical'

import { $isQuoteNode, type QuoteNode } from '@lexical/rich-text'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
} from 'lexical'

function $exitQuote(quote: QuoteNode): void {
  const paragraph = $createParagraphNode()
  paragraph.setDirection(quote.getDirection())
  if (quote.getChildrenSize() === 0 || quote.getTextContent().trim() === '') {
    quote.replace(paragraph)
  } else {
    quote.insertAfter(paragraph)
  }
  paragraph.select()
}

function $handleQuoteEnter(event: KeyboardEvent | null): boolean {
  if (!event || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return false
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const anchor = selection.anchor
  const anchorNode = anchor.getNode()
  const quote = $isQuoteNode(anchorNode) ? anchorNode : anchorNode.getParents().find($isQuoteNode)
  if (!quote) {
    return false
  }

  event.preventDefault()

  if (quote.getTextContent().trim() === '') {
    $exitQuote(quote)
    return true
  }

  if (anchor.type === 'element' && anchorNode === quote && anchor.offset === quote.getChildrenSize()) {
    const last = quote.getLastChild()
    const previous = last?.getPreviousSibling()
    if ($isLineBreakNode(last) && $isLineBreakNode(previous)) {
      last.remove()
      previous.remove()
      $exitQuote(quote)
      return true
    }
  }

  selection.insertNodes([$createLineBreakNode(), $createLineBreakNode()])
  return true
}

export function registerQuoteEnterCommand(editor: LexicalEditor): () => void {
  return editor.registerCommand(KEY_ENTER_COMMAND, $handleQuoteEnter, COMMAND_PRIORITY_LOW)
}
