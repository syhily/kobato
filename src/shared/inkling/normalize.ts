import type { InklingDocument } from '@/shared/inkling/schema'

import { inklingDocumentSchema } from '@/shared/inkling/schema'

// Transient fields that should never participate in semantic comparison.
const TRANSIENT_KEYS = new Set<string>(['key', 'selection'])

// Derived artifacts are recomputed by the server at save or read time; two
// documents that differ only in stale artifacts are semantically equivalent.
const DERIVED_ARTIFACT_KEYS = new Set<string>(['highlightedHtml', 'mathml', 'meta'])

export interface NormalizeInklingOptions {
  /**
   * When true (default), derived artifacts such as `highlightedHtml`, `mathml`,
   * and read-time `meta` are stripped. Set to false only when preserving a
   * freshly prerendered document for transport.
   */
  stripPrerenderArtifacts?: boolean
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeValue(value: unknown, stripDerived: boolean): unknown {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const entry of value) {
      const normalized = normalizeValue(entry, stripDerived)
      if (normalized !== undefined) {
        out.push(normalized)
      }
    }
    return out
  }
  if (isNonNullObject(value)) {
    const out: { [k: string]: unknown } = {}
    for (const [k, v] of Object.entries(value)) {
      if (TRANSIENT_KEYS.has(k)) {
        continue
      }
      if (stripDerived && DERIVED_ARTIFACT_KEYS.has(k)) {
        continue
      }
      const normalized = normalizeValue(v, stripDerived)
      if (normalized !== undefined) {
        out[k] = normalized
      }
    }
    return out
  }
  return value
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  if (isNonNullObject(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Return a deep copy of the document with transient fields removed and object
 * keys sorted into a stable order. The result is suitable for fingerprints and
 * semantic comparison.
 */
export function normalizeInklingDocument(
  document: InklingDocument,
  options: NormalizeInklingOptions = {},
): InklingDocument {
  const stripDerived = options.stripPrerenderArtifacts !== false
  const normalized = normalizeValue(document, stripDerived)
  return inklingDocumentSchema.parse(normalized)
}

/**
 * Compare two Inkling documents for semantic equivalence. Generated node keys,
 * selection state, and stale derived artifacts are ignored.
 */
export function areInklingDocumentsEquivalent(a: InklingDocument, b: InklingDocument): boolean {
  return inklingDocumentFingerprint(a) === inklingDocumentFingerprint(b)
}

/**
 * Produce a stable, deterministic fingerprint for an Inkling document. Two
 * semantically equivalent documents produce the same fingerprint.
 */
export function inklingDocumentFingerprint(document: InklingDocument): string {
  return stableStringify(normalizeInklingDocument(document))
}
