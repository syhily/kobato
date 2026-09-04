import type { ContentRow } from '@/server/infra/db/types'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { validatePortableTextBody } from '@/shared/pt/utils'
import { readStringArray } from '@/shared/utils/tools'
import { isRecord } from '@/shared/utils/type-guards'

// Validate a legacy PortableText `json` blob — a corrupted one must never
// blank the public site. Lexical editor states are NOT arrays; callers on the
// R13 read path use `readRevisionProjection`, which routes by shape.
export function readBody(value: unknown): PortableTextBody {
  if (value === null || value === undefined) {
    return []
  }
  return validatePortableTextBody(value)
}

/**
 * The Lexical twin of `readBody` for the ADMIN revision DTO (the save
 * pipeline stores Lexical states from R9a on). A PT-era row read through this
 * function fails loudly — the R15 backfill is what makes every stored row
 * Lexical.
 */
export function readLexicalBody(value: unknown): LexicalEditorState {
  return lexicalEditorStateSchema.parse(value)
}

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
 * The revision-joined CMS fields both catalog projections derive
 * identically — each empty when the entity has no published revision yet.
 *
 * Body routing (R13): the public read path renders the saved `body_html`
 * projection, so a Lexical row must never be force-parsed as PortableText
 * (that was the `?draft=true` 500). `body` stays strict for legacy PT arrays
 * (R14 feed consumers); Lexical rows surface `body: []` there instead.
 * `bodyState` is populated only when `bodyHtml` is NULL and the blob parses
 * as a Lexical state — the detail controllers use it for the compute-on-read
 * fallback; a parse failure degrades to an empty body, never a throw.
 */
export function readRevisionProjection(revision: ContentRow | null): {
  body: PortableTextBody
  bodyHtml: string | null
  bodyState: LexicalEditorState | null
  imageSources: string[]
  headings: MarkdownHeading[]
} {
  if (revision === null) {
    return { body: [], bodyHtml: null, bodyState: null, imageSources: [], headings: [] }
  }
  const rawBody: unknown = revision.body
  const bodyHtml = revision.bodyHtml
  let body: PortableTextBody = []
  let bodyState: LexicalEditorState | null = null
  if (Array.isArray(rawBody)) {
    body = readBody(rawBody)
  } else if (bodyHtml === null) {
    const parsed = lexicalEditorStateSchema.safeParse(rawBody)
    bodyState = parsed.success ? parsed.data : null
  }
  return {
    body,
    bodyHtml,
    bodyState,
    imageSources: readStringArray(revision.imageSources),
    headings: readHeadings(revision.headings),
  }
}
