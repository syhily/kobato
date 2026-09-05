// Markdown special-markup unwrap — the headless body of the backspace
// policy "undo a markdown special format when deleting at the end of a
// formatted text node". Extracted from the keyboard handler so the grammar
// (which formats unwrap, with which markup) is pinned by its own unit table
// (test/unit/plugins/behaviour/markdown-unwrap.test.ts); the handler keeps
// only its caret-position gate and event choreography.

import type { RangeSelection, TextNode } from 'lexical'

/**
 * The formats a trailing backspace unwraps, and the markup re-added around
 * the text so the writer can keep editing the unformatted source (`code`
 * before `superscript` before `subscript` before `strikethrough` — the first
 * format the node carries wins).
 */
export const SPECIAL_MARKUPS = {
  code: '`',
  superscript: '^',
  subscript: '~',
  strikethrough: '~~',
}

export type SpecialMarkupFormat = keyof typeof SPECIAL_MARKUPS

/**
 * Unwrap the first special markup format `anchorNode` carries: clear the
 * format, re-add the markup around the text minus its last character (the
 * one backspace would have eaten), and push the caret offsets to accommodate
 * the added markup. Returns true when an unwrap happened; false when the
 * node carries no special format and the caller falls through to its other
 * backspace handling.
 */
export function $unwrapSpecialMarkupFormat(anchorNode: TextNode, selection: RangeSelection): boolean {
  const textContent = anchorNode.getTextContent()

  for (const tag of Object.keys(SPECIAL_MARKUPS) as Array<SpecialMarkupFormat>) {
    if (anchorNode.hasFormat(tag)) {
      const markup = SPECIAL_MARKUPS[tag]
      // for replacement strings e.g. {{variable}} we shouldn't add the markup (assumes use of ReplacementStringsPlugin)
      let newText = textContent
      if (tag === 'code' && textContent.match(/{.*?}(?![A-Za-z\s])/)) {
        newText = newText.slice(0, -1)
      } else {
        newText = markup + newText + markup
        newText = newText.slice(0, -1) // remove last markup character
      }

      // manually clear formatting and push offset to accommodate for the added markup
      anchorNode.setFormat(0)
      anchorNode.setTextContent(newText)
      selection.anchor.offset = selection.anchor.offset + newText.length - textContent.length
      selection.focus.offset = selection.focus.offset + newText.length - textContent.length

      return true
    }
  }

  return false
}
