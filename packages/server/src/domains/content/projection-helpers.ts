import type { ContentRow } from '@kobato/server/infra/db/types'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { MarkdownHeading } from '@kobato/shared/utils/toc'

import { validatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { canonicalizeLexicalBodyShape } from '@kobato/shared/lexical/canonicalize'
import { convertPtBodyToLexical } from '@kobato/shared/lexical/mapping'
import { EMPTY_LEXICAL_BODY, parseLexicalBody } from '@kobato/shared/lexical/schema'
import { readStringArray } from '@kobato/shared/utils/tools'
import { isRecord } from '@kobato/shared/utils/type-guards'

// `content.body` is `text({ mode: 'json' })` so Drizzle hands it to us
// as `unknown`. The read path is DUAL-SHAPE until the data migration
// lands (R6): pre-migration rows hold the PT shape (`Array.isArray`),
// post-migration rows the Lexical shape (`{root: ...}`). PT rows convert
// through the one-way mapping + canonicalize; Lexical rows round-trip
// through the gate. A corrupted blob (e.g. a direct INSERT) is reported
// as `null` (`parseStoredBody`) or falls back to an empty body
// (`readBody`) so it never blanks the public site.
export function readBody(value: unknown): LexicalBody {
  return parseStoredBody(value) ?? EMPTY_LEXICAL_BODY
}

/** Dual-shape stored-body parse; `null` on invalid/corrupt values. */
export function parseStoredBody(value: unknown): LexicalBody | null {
  if (value === null || value === undefined) {
    return null
  }
  if (Array.isArray(value)) {
    try {
      const pt = validatePortableTextBody(value)
      // An empty stored PT body stays empty (the mapping would pad the
      // editor's minimum document — the wire must not gain a stray
      // paragraph for an empty revision).
      if (pt.length === 0) {
        return EMPTY_LEXICAL_BODY
      }
      return canonicalizeLexicalBodyShape(convertPtBodyToLexical(pt))
    } catch {
      return null
    }
  }
  try {
    // Read-path validation without the headless parse double check: the
    // stored bodies were canonicalized at save time, so the zod gate is
    // enough here (canonicalize on every projection read would pay a
    // headless-parse tax per request).
    return parseLexicalBody(value)
  } catch {
    return null
  }
}

// The canonical empty form lives in `@kobato/shared/lexical/schema`
// (`EMPTY_LEXICAL_BODY`) — it maps back to the PT wire's `[]` so an empty
// revision renders exactly as before.

export function readHeadings(value: unknown): MarkdownHeading[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: MarkdownHeading[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue
    }
    if (typeof entry.depth !== 'number' || typeof entry.text !== 'string') {
      continue
    }
    out.push({
      depth: entry.depth,
      text: entry.text,
      slug: typeof entry.slug === 'string' ? entry.slug : '',
    })
  }
  return out
}

/**
 * The revision-joined CMS fields both catalog projections (`toCmsPost`,
 * `toCmsPage`) derive identically: the Lexical body, the image-source
 * list, and the heading anchors — each empty when the entity has no
 * published revision yet.
 */
export function readRevisionProjection(revision: ContentRow | null): {
  body: LexicalBody
  imageSources: string[]
  headings: MarkdownHeading[]
} {
  return {
    body: revision !== null ? readBody(revision.body) : EMPTY_LEXICAL_BODY,
    imageSources: revision !== null ? readStringArray(revision.imageSources) : [],
    headings: revision !== null ? readHeadings(revision.headings) : [],
  }
}
