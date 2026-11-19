import type { RangeSelection, TextNode } from 'lexical'

export const SPECIAL_MARKUPS = {
  code: '`',
  superscript: '^',
  subscript: '~',
  strikethrough: '~~',
}
export type SpecialMarkupFormat = keyof typeof SPECIAL_MARKUPS

function isSpecialMarkupFormat(format: string): format is SpecialMarkupFormat {
  return format in SPECIAL_MARKUPS
}

export function $unwrapSpecialMarkupFormat(anchorNode: TextNode, selection: RangeSelection): boolean {
  const textContent = anchorNode.getTextContent()
  for (const format of Object.keys(SPECIAL_MARKUPS)) {
    if (!isSpecialMarkupFormat(format)) {
      continue
    }
    if (anchorNode.hasFormat(format)) {
      const markup = SPECIAL_MARKUPS[format]
      let newText = textContent
      if (!(format === 'code' && /{.*?}(?![A-Za-z\s])/.test(textContent))) {
        newText = markup + newText + markup
      }
      newText = newText.slice(0, -1)
      anchorNode.setFormat(0)
      anchorNode.setTextContent(newText)
      selection.anchor.offset = selection.anchor.offset + newText.length - textContent.length
      selection.focus.offset = selection.focus.offset + newText.length - textContent.length

      return true
    }
  }

  return false
}
