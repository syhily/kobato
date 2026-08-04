/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { Block } from '@kobato/shared/legacy-pt/schema'

// Normalisation shared by PortableText semantic equality (`pt-bridge`
// dirty/conflict guards) AND the admin block-level diff anchoring logic
// (`portable-text-diff`). Keeping this in `@/shared/*` satisfies the UI
// import boundary while guaranteeing the predicates stay mechanically in
// lockstep — diff UI must never disagree with equivalence checks again.

const DECORATOR_MARKS = new Set(['strong', 'em', 'underline', 'strike-through', 'code'])

const PRERENDER_ARTIFACT_KEYS = new Set(['highlightedHtml', 'mathml', 'svg'])

type Json = string | number | boolean | null | { [k: string]: Json } | Json[]

function resolveMarks(block: Block): Block {
  if (block._type !== 'block') {
    return block
  }
  const markDefs = (block as { markDefs?: ReadonlyArray<{ _key: string } & Record<string, unknown>> }).markDefs ?? []
  const lookup = new Map<string, Record<string, unknown>>()
  for (const def of markDefs) {
    const { _key: _ignored, ...rest } = def
    lookup.set(def._key, rest)
  }
  const resolvedChildren = (block.children ?? []).map((child) => {
    if (child._type !== 'span') {
      return child
    }
    const original = (child as { marks?: ReadonlyArray<string> }).marks ?? []
    if (original.length === 0) {
      return child
    }
    const resolved = original.map((name) =>
      DECORATOR_MARKS.has(name) ? { decorator: name } : (lookup.get(name) ?? { unresolved: name }),
    )
    return { ...child, marks: resolved }
  })
  const { markDefs: _drop, ...rest } = block as Record<string, unknown>
  return { ...rest, children: resolvedChildren } as Block
}

function semanticCanonicalJson(value: unknown): Json | undefined {
  if (Array.isArray(value)) {
    const items: Json[] = []
    for (const entry of value) {
      const normalized = semanticCanonicalJson(entry)
      if (normalized !== undefined) {
        items.push(normalized)
      }
    }
    return items.length === 0 ? undefined : items
  }
  if (value !== null && typeof value === 'object') {
    const out: { [k: string]: Json } = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '_key') {
        continue
      }
      if (PRERENDER_ARTIFACT_KEYS.has(k)) {
        continue
      }
      const normalized = semanticCanonicalJson(v)
      if (normalized === undefined) {
        continue
      }
      out[k] = normalized
    }
    return Object.keys(out).length === 0 ? undefined : out
  }
  if (value === undefined) {
    return undefined
  }
  return value as Json
}

function semanticCanonicalStringify(value: Json | undefined): string {
  if (value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => semanticCanonicalStringify(entry)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${semanticCanonicalStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Stable semantics-only fingerprint (`_key`-agnostic, mirrors diff anchoring). */
export function portableTextBlockSemanticFingerprint(block: Block): string {
  return semanticCanonicalStringify(semanticCanonicalJson(resolveMarks(block))) || `empty:${block._type}`
}
