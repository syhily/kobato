import { createHighlighter } from 'shiki'

import { SHIKI_THEMES } from '@/server/infra/pt/shiki'
import { createPromiseMemo } from '@/shared/utils/memo'

// Process-level highlighter singleton (json only). Single-flight
// semantics: share-in-flight; failure: retry.
const getHighlighter = createPromiseMemo(() =>
  createHighlighter({
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
    langs: ['json'],
  }),
)

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
