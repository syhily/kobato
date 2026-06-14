import { createHighlighter } from 'shiki'

import { SHIKI_THEMES } from '@/server/infra/pt/shiki'

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getHighlighter() {
  if (highlighterPromise === null) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
      langs: ['json'],
    }).catch((err) => {
      highlighterPromise = null
      throw err
    })
  }
  return highlighterPromise
}

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
