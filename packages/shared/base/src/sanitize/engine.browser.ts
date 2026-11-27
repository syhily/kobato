import type { SanitizeStrategyConfig } from '@kobato/base/sanitize/config'

import { createPurifySanitizer } from '@kobato/base/sanitize/purify-core'
import createDOMPurify from 'dompurify'

const sanitize = createPurifySanitizer(createDOMPurify())

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitize(html, config)
}
