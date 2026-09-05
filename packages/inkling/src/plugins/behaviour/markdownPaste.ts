// The headless leg of the paste markdown dialect: clipboard markdown text in,
// sanitized HTML out. `MarkdownPastePlugin` feeds the result into Lexical's
// HTML import; tests and other headless callers can use it without mounting a
// composer or synthesizing a DataTransfer. The engine is `pasteDialect`
// (`@/markdown/paste-dialect`) — the same dialect module the markdown card's
// HTML export uses (`@/nodes/base/nodes/markdown/markdown-renderer`), so
// "paste" names this pipeline, not a forked engine.
import { pasteDialect } from '@/markdown/paste-dialect'
import { sanitizeHtml } from '@/utils/sanitize-html'

interface MarkdownPasteOptions {
  allowBr: boolean
}

export function markdownToSanitizedHtml(text: string, { allowBr }: MarkdownPasteOptions): string {
  const markdownHtml = pasteDialect.render(text)
  // don't use cleanBasicHtml as it removes images and hr; in this case, we need to remove just br
  const cleanedHtml = allowBr ? markdownHtml : markdownHtml.replace(/<br\s?\/?>/g, '')
  return sanitizeHtml(cleanedHtml, { replaceJS: true })
}
