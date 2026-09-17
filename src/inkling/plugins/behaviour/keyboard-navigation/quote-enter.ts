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

// Enter inside a blockquote. Upstream's QuoteNode.insertNewAfter always opens
// a plain paragraph AFTER the quote, so a single Enter ejects the caret from
// the blockquote — the behaviour this module replaces:
//
//   Enter          → new paragraph inside the SAME blockquote
//   Enter on empty → leave the blockquote (paragraph after it)
//
// "Paragraph inside a blockquote" is a DOUBLE LINE BREAK, not a paragraph
// node: the denest transform (src/inkling/transforms/transforms/denest.ts)
// evicts non-inline children from element nodes, and the HTML import
// converter (ExtendedQuoteNode) flattens blockquote paragraphs into two line
// breaks for exactly that reason. Two breaks are also what makes the markdown
// export keep the quote contiguous (a blank '>' line between text lines).

// Leave the quote: drop the caret into a fresh paragraph after it, or replace
// the quote outright when nothing worth keeping is left inside.
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
  // null event is the IME/mobile Enter path; shift+enter stays a soft line
  // break, cmd/ctrl+enter stays with the card edit-mode toggle (enter.ts runs
  // first and owns it)
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

  // an empty blockquote has nothing to break — a single Enter leaves it
  if (quote.getTextContent().trim() === '') {
    $exitQuote(quote)
    return true
  }

  // second Enter: the caret sits at the quote end right after the paragraph
  // break the previous Enter inserted — remove the break and leave the quote
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

  // plain Enter: split out a new paragraph inside the same blockquote
  selection.insertNodes([$createLineBreakNode(), $createLineBreakNode()])
  return true
}

export function registerQuoteEnterCommand(editor: LexicalEditor): () => void {
  return editor.registerCommand(KEY_ENTER_COMMAND, $handleQuoteEnter, COMMAND_PRIORITY_LOW)
}
