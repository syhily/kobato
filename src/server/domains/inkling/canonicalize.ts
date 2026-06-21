import type { InklingDocument } from '@/shared/inkling/schema'

import { parseInklingDocument } from '@/server/domains/inkling/schema'
import { collectImageSrcs, collectLinkUrls } from '@/shared/inkling/links'
import { normalizeInklingDocument } from '@/shared/inkling/normalize'
import { isSafeUrl } from '@/shared/sanitize-url'

export interface CanonicalizeInklingOptions {
  /**
   * When true (default), stale prerender artifacts such as `highlightedHtml`,
   * `mathml` and read-time `meta` are stripped. Set to false only when
   * canonicalizing a freshly prerendered document for storage.
   */
  stripPrerenderArtifacts?: boolean
  /**
   * When true (default), link URLs are validated against the shared
   * `isSafeUrl` allowlist so `javascript:` / `data:` / `vbscript:` schemes
   * (and control-character-smuggled variants) are rejected at the API
   * perimeter rather than persisted. Renderers still re-sanitize at the
   * output boundary; this flag exists so internal/migration callers that
   * operate on already-trusted data can opt out.
   */
  validateLinkUrls?: boolean
}

/**
 * Server-side canonicalizer for Inkling documents. Validates the raw input,
 * removes transient editor state (selection, node keys), enforces link-URL
 * safety, and optionally strips stale derived artifacts so that downstream
 * prerender/derived-data passes operate on a clean, deterministic document.
 *
 * Throws when the input fails schema validation or contains a disallowed
 * link URL. Callers at the API perimeter should translate the throw into a
 * structured `BAD_REQUEST` response (see `canonicalizeBodyOrThrow`).
 */
export function canonicalizeInklingDocument(value: unknown, options: CanonicalizeInklingOptions = {}): InklingDocument {
  const document = parseInklingDocument(value)
  if (options.validateLinkUrls !== false) {
    assertSafeLinkUrls(document)
    assertSafeImageSrcs(document)
  }
  return normalizeInklingDocument(document, {
    stripPrerenderArtifacts: options.stripPrerenderArtifacts !== false,
  })
}

/**
 * Reject the document if any link URL fails `isSafeUrl`. Renderers all
 * re-sanitize on output, so an unsafe URL here is not immediately
 * exploitable — but persisting it lets it leak through any future renderer
 * or API consumer that forgets the second layer, and pollutes the search
 * snapshot / feed / revision history with attacker-controlled schemes.
 */
function assertSafeLinkUrls(document: InklingDocument): void {
  for (const url of collectLinkUrls(document)) {
    if (!isSafeUrl(url)) {
      throw new UnsafeLinkUrlError(url)
    }
  }
}

/**
 * Reject the document if any image `src` fails `isSafeUrl`. The render layer
 * runs every `src` through `sanitizeUrl`, whose scheme allow-list excludes
 * `data:` — so a persisted `data:` image renders as `<img src="#">` forever
 * (a permanently broken image that no later edit fixes). Enforcing http(s)
 * at the perimeter guarantees what you see in the editor is what renders.
 */
function assertSafeImageSrcs(document: InklingDocument): void {
  for (const src of collectImageSrcs(document)) {
    if (!isSafeUrl(src)) {
      throw new UnsafeImageSrcError(src)
    }
  }
}

/**
 * Dedicated error class so callers can distinguish URL-safety failures from
 * generic schema errors when translating to a client-facing message.
 */
export class UnsafeLinkUrlError extends Error {
  readonly url: string
  constructor(url: string) {
    super(`Document contains a disallowed link URL: ${url.length > 80 ? `${url.slice(0, 80)}…` : url}`)
    this.name = 'UnsafeLinkUrlError'
    this.url = url
  }
}

/** Image variant of {@link UnsafeLinkUrlError} for disallowed `src` schemes. */
export class UnsafeImageSrcError extends Error {
  readonly src: string
  constructor(src: string) {
    super(`Document contains a disallowed image src: ${src.length > 80 ? `${src.slice(0, 80)}…` : src}`)
    this.name = 'UnsafeImageSrcError'
    this.src = src
  }
}
