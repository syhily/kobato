import { getLoadedPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import { sanitizeHtml } from '@kobato/inkling-internal/utils/sanitize-html'

interface MarkdownPasteOptions {
  allowBr: boolean
}

export function markdownToSanitizedHtml(text: string, { allowBr }: MarkdownPasteOptions): string {
  const dialect = getLoadedPasteDialect()
  if (!dialect) {
    throw new Error('markdownToSanitizedHtml requires the paste dialect chunk — await loadPasteDialect() first')
  }
  const markdownHtml = dialect.render(text)
  const cleanedHtml = allowBr ? markdownHtml : markdownHtml.replace(/<br\s?\/?>/g, '')
  return sanitizeHtml(cleanedHtml, { replaceJS: true })
}
