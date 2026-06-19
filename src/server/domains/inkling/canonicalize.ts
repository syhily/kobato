import type { InklingDocument } from '@/shared/inkling/schema'

import { parseInklingDocument } from '@/server/domains/inkling/schema'
import { normalizeInklingDocument } from '@/shared/inkling/normalize'

export interface CanonicalizeInklingOptions {
  /**
   * When true (default), stale prerender artifacts such as `highlightedHtml`,
   * `mathml` and read-time `meta` are stripped. Set to false only when
   * canonicalizing a freshly prerendered document for storage.
   */
  stripPrerenderArtifacts?: boolean
}

/**
 * Server-side canonicalizer for Inkling documents. Validates the raw input,
 * removes transient editor state (selection, node keys) and optionally strips
 * stale derived artifacts so that downstream prerender/derived-data passes
 * operate on a clean, deterministic document.
 */
export function canonicalizeInklingDocument(value: unknown, options: CanonicalizeInklingOptions = {}): InklingDocument {
  const document = parseInklingDocument(value)
  return normalizeInklingDocument(document, {
    stripPrerenderArtifacts: options.stripPrerenderArtifacts !== false,
  })
}
