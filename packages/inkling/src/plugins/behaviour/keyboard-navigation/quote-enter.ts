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

// Enter inside a blockquote: plain Enter opens a new paragraph inside the SAME
// blockquote, Enter on an empty quote leaves it. Upstream's QuoteNode.insertNewAfter
// always opens a plain paragraph after the quote.
//
// "Paragraph inside a blockquote" must be a DOUBLE LINE BREAK, not a paragraph node:
// the denest transform evicts non-inline children from element nodes, and the HTML
// import converter (ExtendedQuoteNode) flattens blockquote paragraphs into two line
// breaks for that reason. Two breaks also keep the markdown export's quote contiguous
// (a blank '>' line).

// Leave the quote: drop the caret into a fresh paragraph after it, or replace the
// quote outright when nothing worth keeping is left inside.
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
  // A null event is the IME/mobile Enter path; shift+enter is a soft line break and
  // cmd/ctrl+enter belongs to the card edit-mode toggle (enter.ts runs first).
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

  // Second Enter: the caret sits at the quote end right after the break pair the
  // previous Enter inserted — remove both breaks and leave the quote.
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
