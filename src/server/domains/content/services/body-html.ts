import type { LexicalEditorState } from '@/shared/lexical/schema'

import { getLogger } from '@/server/infra/logger'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'

const log = getLogger('content')

/**
 * The public read path serves the saved `body_html` projection. Rows saved
 * before R9b (or whose projection failed at save time) carry NULL — fall back
 * to computing the projection on read. Never throws: a body that cannot
 * project renders empty rather than 500ing the detail page.
 */
export async function resolveBodyHtml(source: {
  bodyHtml: string | null
  bodyState: LexicalEditorState | null
}): Promise<string> {
  if (source.bodyHtml !== null) {
    return source.bodyHtml
  }
  if (source.bodyState === null) {
    return ''
  }
  try {
    const projections = await computeBodyProjections(source.bodyState)
    return projections.bodyHtml
  } catch (error) {
    log.warn('body_html projection fallback failed; rendering empty body', { error })
    return ''
  }
}
