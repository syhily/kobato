import createDOMPurify from 'dompurify'

import type { SanitizeStrategyConfig } from '@/shared/sanitize/config'

import { createPurifySanitizer } from '@/shared/sanitize/purify-core'

// Browser engine for `sanitizeHtmlString`; vite's client environment aliases
// the node engine's specifier here so the client bundle binds DOMPurify to
// the real window. All behavioral rules live in the shared purify core — the
// engines differ only in the DOM they bind.

const sanitize = createPurifySanitizer(createDOMPurify())

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return sanitize(html, config)
}
