// Headless leg of the paste markdown dialect: clipboard markdown text in,
// sanitized HTML out, fed into Lexical's HTML import by MarkdownPastePlugin
// (headless callers need no composer or DataTransfer). The engine is the
// shared paste dialect behind the lazy port — the same module the markdown
// card's HTML export uses, not a forked engine. Callers must hold the loaded
// engine: the paste path awaits the port before dispatching; headless callers
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
  // cleanBasicHtml would also strip images and hr; only br needs removal here
  const cleanedHtml = allowBr ? markdownHtml : markdownHtml.replace(/<br\s?\/?>/g, '')
  return sanitizeHtml(cleanedHtml, { replaceJS: true })
}
