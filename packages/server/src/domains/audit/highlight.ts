import { SHIKI_THEMES, createShikiHighlighter } from '@kobato/server/infra/lexical/shiki.ts'
import { createPromiseMemo } from '@kobato/utils/memo.ts'

const getHighlighter = createPromiseMemo(() => createShikiHighlighter())

export async function highlightAuditLogDetails(details: Record<string, unknown> | null): Promise<string | null> {
  if (!details) {
    return null
  }
  const json = JSON.stringify(details, null, 2)
  try {
    const highlighter = await getHighlighter()
    return highlighter.codeToHtml(json, {
      lang: 'json',
      themes: SHIKI_THEMES,
      defaultColor: false,
    })
  } catch {
    return null
  }
}
