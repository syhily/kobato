import type { SanitizeStrategyConfig } from '@kobato/sanitize/config'
import type { WindowLike } from 'dompurify'

import { createPurifySanitizer } from '@kobato/sanitize/purify-core'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

let cachedSanitizer: ReturnType<typeof createPurifySanitizer> | undefined

function getSanitizer(): ReturnType<typeof createPurifySanitizer> {
  if (!cachedSanitizer) {
    const dom = new JSDOM('')
    cachedSanitizer = createPurifySanitizer(createDOMPurify(dom.window as WindowLike))
  }
  return cachedSanitizer
}

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return getSanitizer()(html, config)
}
