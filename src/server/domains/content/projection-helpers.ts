import type { ContentRow } from '@/server/infra/db/types'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { readStringArray } from '@/shared/utils/tools'
import { isRecord } from '@/shared/utils/type-guards'

/**
 * The Lexical body reader for the ADMIN revision DTO (the save pipeline
 * stores Lexical states from R9a on). A PT-era row read through this
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
 * Body routing (R13/R14): every public read path serves a saved projection
 * column (`body_html` for SSR, `body_html_feed` for RSS/Atom), so the raw
 * `body` blob never leaves the server through this projection. `bodyState`
 * is populated only when a projection column is NULL and the blob parses as
 * a Lexical state — the detail controllers and the feed generator use it for
 * the compute-on-read fallback; a parse failure (or a legacy PT array, which
 * no read path renders anymore) degrades to an empty body, never a throw.
 */
export function readRevisionProjection(revision: ContentRow | null): {
  bodyHtml: string | null
  bodyHtmlFeed: string | null
  bodyState: LexicalEditorState | null
  imageSources: string[]
  headings: MarkdownHeading[]
} {
  if (revision === null) {
    return { bodyHtml: null, bodyHtmlFeed: null, bodyState: null, imageSources: [], headings: [] }
  }
  const bodyHtml = revision.bodyHtml
  const bodyHtmlFeed = revision.bodyHtmlFeed
  let bodyState: LexicalEditorState | null = null
  if ((bodyHtml === null || bodyHtmlFeed === null) && !Array.isArray(revision.body)) {
    const parsed = lexicalEditorStateSchema.safeParse(revision.body)
    bodyState = parsed.success ? parsed.data : null
  }
  return {
    bodyHtml,
    bodyHtmlFeed,
    bodyState,
    imageSources: readStringArray(revision.imageSources),
    headings: readHeadings(revision.headings),
  }
}
