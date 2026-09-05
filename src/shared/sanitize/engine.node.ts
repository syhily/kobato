import type { WindowLike } from 'dompurify'

import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

import type { SanitizeStrategyConfig } from '@/shared/sanitize/config'

import { createPurifySanitizer } from '@/shared/sanitize/purify-core'

// Server/SSR engine for `sanitizeHtmlString`; the `sanitize-html-engine-alias`
// vite plugin swaps this module for the browser engine in the client bundle,
// keeping jsdom's Node-only dependency chain out of the client.
//
// One DOMPurify over one process-cached JSDOM, bound lazily on the first
// sanitize call (the JSDOM construction is a one-time cost; steady-state is
// sub-millisecond per body — R16i benchmark: avg 0.34ms over the 9031-row
// dev corpus). The byte parity contract with the browser engine holds by
// construction: same DOMPurify, same shared core, and jsdom's serializer
// follows the same HTML fragment serialization algorithm as the browsers.
// Known residual (applies to any server-side engine): Blink additionally
// escapes `<`/`>` in attribute values where the spec (and jsdom) does not —
// a handful of legacy posts whose `data-code` samples contain markup still
// hydrate-mismatch on Chrome-family browsers; the DOM is identical either
// way, so React re-sets innerHTML and moves on.

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
