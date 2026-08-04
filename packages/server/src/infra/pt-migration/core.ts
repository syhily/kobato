import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { lexicalBodyToHtml } from '@kobato/server/render/lexical-html/lexicalBodyToHtml'
import { canonicalizePortableTextBodyShape } from '@kobato/shared/legacy-pt/canonicalize'
import { commentBodySchema } from '@kobato/shared/legacy-pt/comment-schema'
import { safeValidatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { canonicalizeLexicalBodyShape } from '@kobato/shared/lexical/canonicalize'
import { canonicalizeLexicalCommentBodyShape } from '@kobato/shared/lexical/comment-canonicalize'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { convertPtBodyToLexical } from '@kobato/shared/lexical/mapping'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'

// Per-row PortableText → Lexical conversion pipeline (the built-in
// counterpart of the retired `scripts/migrate-pt-to-lexical.ts`). Pure
// functions, no DB access — `migrate.ts` drives them over the
// `content.body` / `comment.body` rows.
//
// Per-row pipeline: JSON.parse → PT-shape gate (`Array.isArray` + first
// element carries `_type`) → safeValidate (`portableTextBodySchema` for
// content, `commentBodySchema` for comments) →
// `canonicalizePortableTextBodyShape` → `convertPtBodyToLexical` →
// `canonicalizeLexicalBodyShape` (content) /
// `canonicalizeLexicalCommentBodyShape` (comments, mirroring the server's
// comment write path) → read-path gate (`parseLexicalBody` /
// `parseLexicalCommentBody`) → the serialized canonical body is handed to
// the caller for the write.
//
// Error classification is stable and machine-readable: `invalid-json`
// for JSON.parse failures, the truncated ZodError message for PT-shape
// rows the schema rejects (unknown `_type`, comment rows carrying
// disallowed nodes, bad URLs in link markDefs), anything else from the
// converter itself.

export type PtMigrationRowKind = 'content' | 'comment'

export type PtRowStatus = 'migrated' | 'skipped-lexical' | 'error'

export type PtRowOutcome =
  | { status: 'migrated'; beforeBytes: number; afterBytes: number; converted: string }
  | { status: 'skipped-lexical'; beforeBytes: number }
  | { status: 'error'; beforeBytes: number; error: string }

/** True when the value looks like a stored PortableText body: a JSON array whose first element carries `_type`. */
export function isPortableTextShape(parsed: unknown): parsed is unknown[] {
  if (!Array.isArray(parsed)) {
    return false
  }
  if (parsed.length === 0) {
    return true
  }
  const first: unknown = parsed[0]
  return typeof first === 'object' && first !== null && '_type' in first
}

/** Run the one-way conversion pipeline. Returns the canonical Lexical body or throws. */
export function convertPtRow(parsed: unknown, kind: PtMigrationRowKind): LexicalBody | LexicalCommentBody {
  if (kind === 'comment') {
    const pt = commentBodySchema.parse(parsed)
    return canonicalizeLexicalCommentBodyShape(convertPtBodyToLexical(canonicalizePortableTextBodyShape(pt)))
  }
  const result = safeValidatePortableTextBody(parsed)
  if (!result.ok) {
    throw result.error
  }
  return canonicalizeLexicalBodyShape(convertPtBodyToLexical(canonicalizePortableTextBodyShape(result.body)))
}

/** Re-run the read-path gate on the converted body so the stored form is pinned against what the server parses. */
export function gateConverted(converted: LexicalBody | LexicalCommentBody, kind: PtMigrationRowKind): void {
  if (kind === 'comment') {
    parseLexicalCommentBody(converted)
  } else {
    parseLexicalBody(converted)
  }
}

/** Spot-render through the string renderer (default mode) to prove the body survives SSR. */
export function spotRender(body: LexicalBody): void {
  lexicalBodyToHtml(body, { headingSlugs: [], mode: 'default', footnotesSectionTitle: '注' })
}

export function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 300 ? `${message.slice(0, 300)}…` : message
}

/**
 * Full per-row pipeline over the stored string: JSON.parse → shape gate →
 * convert → read-path gate → serialize. Never writes; the caller decides
 * (and, in `--check` mode, discards) the `converted` payload.
 */
export function processPtRow(kind: PtMigrationRowKind, id: number, storedBody: string): PtRowOutcome {
  const beforeBytes = Buffer.byteLength(storedBody)
  let parsed: unknown
  try {
    parsed = JSON.parse(storedBody)
  } catch {
    return { status: 'error', beforeBytes, error: 'invalid-json' }
  }
  if (!isPortableTextShape(parsed)) {
    return { status: 'skipped-lexical', beforeBytes }
  }
  try {
    const converted = convertPtRow(parsed, kind)
    gateConverted(converted, kind)
    const serialized = JSON.stringify(converted)
    return { status: 'migrated', beforeBytes, afterBytes: Buffer.byteLength(serialized), converted: serialized }
  } catch (error) {
    return { status: 'error', beforeBytes, error: truncateError(error) }
  }
}
