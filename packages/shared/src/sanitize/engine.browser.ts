import type { SanitizeStrategyConfig } from '@kobato/shared/sanitize/config.ts'

import { createPurifySanitizer } from '@kobato/shared/sanitize/purify-core.ts'
import createDOMPurify from 'dompurify'

// Browser engine for `sanitizeHtmlString`; vite's client environment aliases
// the node engine's specifier here so DOMPurify binds the real window.

const sanitize = createPurifySanitizer(createDOMPurify())

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitize(html, config)
}
