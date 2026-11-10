import type { WindowLike } from 'dompurify'

import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

import type { SanitizeStrategyConfig } from '@/shared/sanitize/config'

import { createPurifySanitizer } from '@/shared/sanitize/purify-core'

// Server/SSR engine for `sanitizeHtmlString`; the `sanitize-html-engine-alias`
// vite plugin swaps this module for the browser engine in the client bundle,
// keeping jsdom's Node-only dependency chain out of the client. One DOMPurify
// over one lazily bound, process-cached JSDOM; byte parity with the browser
// engine holds by construction (same DOMPurify, same shared core).
//
// Known residual: Blink escapes `<`/`>` in attribute values where the spec
// (and jsdom) does not, so posts whose `data-code` samples contain markup
// hydrate-mismatch on Chrome-family browsers; the DOM is identical, so React
// re-sets innerHTML and moves on.

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
