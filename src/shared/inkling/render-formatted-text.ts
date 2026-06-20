import {
  hasInklingFormat,
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { escapeHtml } from '@/shared/utils/security'

/**
 * Render inkling-formatted text to HTML with canonical nesting order.
 *
 * Lexical treats the CODE format as exclusive: when CODE is set, other
 * text formats (bold, italic, underline, strikethrough) are not applied.
 * This matches the behaviour of `CommentInklingBody` and the comment email
 * renderer.
 *
 * Nesting order (outermost first):
 *   CODE > STRIKETHROUGH > UNDERLINE > ITALIC > BOLD
 *
 * Used by both the article React renderer (TextMark) and the comment
 * React renderer (CommentInklingBody), replacing their previously divergent
 * implementations.
 */
export function sharedRenderFormattedText(text: string, format: number | undefined): string {
  let html = escapeHtml(text)
  const f = format ?? 0
  if (f === 0) {
    return html
  }

  // CODE is exclusive — other formats are skipped when code is active.
  if (hasInklingFormat(format, INKLING_FORMAT_CODE)) {
    return `<code>${html}</code>`
  }

  if (hasInklingFormat(format, INKLING_FORMAT_STRIKETHROUGH)) {
    html = `<s>${html}</s>`
  }
  if (hasInklingFormat(format, INKLING_FORMAT_UNDERLINE)) {
    html = `<u>${html}</u>`
  }
  if (hasInklingFormat(format, INKLING_FORMAT_ITALIC)) {
    html = `<em>${html}</em>`
  }
  if (hasInklingFormat(format, INKLING_FORMAT_BOLD)) {
    html = `<strong>${html}</strong>`
  }

  return html
}
