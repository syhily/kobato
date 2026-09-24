// The headless leg of the paste markdown dialect: clipboard markdown text in,
// sanitized HTML out. `MarkdownPastePlugin` feeds the result into Lexical's
// HTML import; tests and other headless callers can use it without mounting a
// composer or synthesizing a DataTransfer. The engine is `pasteDialect`
// (`@/inkling/markdown/paste-dialect`) behind the lazy port
// (`@/inkling/markdown/lazy-paste-dialect`) — the same dialect module the
// markdown card's HTML export uses
// (`@/inkling/nodes/base/nodes/markdown/markdown-renderer`), so "paste" names
// this pipeline, not a forked engine. Callers must hold the loaded engine:
// the paste path awaits the port before dispatching, and headless callers
// await `loadPasteDialect()` first.
import { getLoadedPasteDialect } from '@/inkling/markdown/lazy-paste-dialect'
import { sanitizeHtml } from '@/inkling/utils/sanitize-html'

interface MarkdownPasteOptions {
  allowBr: boolean
}

export function markdownToSanitizedHtml(text: string, { allowBr }: MarkdownPasteOptions): string {
  const dialect = getLoadedPasteDialect()
  if (!dialect) {
    throw new Error('markdownToSanitizedHtml requires the paste dialect chunk — await loadPasteDialect() first')
  }
  const markdownHtml = dialect.render(text)
  // don't use cleanBasicHtml as it removes images and hr; in this case, we need to remove just br
  const cleanedHtml = allowBr ? markdownHtml : markdownHtml.replace(/<br\s?\/?>/g, '')
  return sanitizeHtml(cleanedHtml, { replaceJS: true })
}
