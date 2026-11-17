import createDOMPurify from 'dompurify'

import type { SanitizeStrategyConfig } from './config'

import { createPurifySanitizer } from './purify-core'

// Browser engine for `sanitizeHtmlString`; vite's client environment aliases
// the node engine's specifier here so DOMPurify binds the real window.

const sanitize = createPurifySanitizer(createDOMPurify())

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitize(html, config)
}
