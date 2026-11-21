import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { computeBodyProjections } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('content')

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

export async function resolveBodyHtmlFeed(source: {
  bodyHtmlFeed: string | null
  bodyState: LexicalEditorState | null
}): Promise<string> {
  if (source.bodyHtmlFeed !== null) {
    return source.bodyHtmlFeed
  }
  if (source.bodyState === null) {
    return ''
  }
  try {
    const projections = await computeBodyProjections(source.bodyState)
    return projections.bodyHtmlFeed
  } catch (error) {
    log.warn('body_html_feed projection fallback failed; rendering empty body', { error })
    return ''
  }
}
