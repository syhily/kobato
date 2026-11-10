import type { ContentRow } from '@/server/infra/db/types'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { readStringArray } from '@/shared/utils/tools'
import { isRecord } from '@/shared/utils/type-guards'

/** Parses a stored Lexical body; every stored row is a Lexical state, so anything else fails loudly. */
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
 * The revision-joined CMS fields both catalog projections derive identically;
 * each is empty when the entity has no published revision yet. Public read paths
 * serve the saved projection columns (`body_html`, `body_html_feed`), so the raw
 * `body` blob never leaves the server: `bodyState` is populated only for the
 * compute-on-read fallback (a column is NULL and the blob parses as Lexical), and
 * a parse failure degrades to an empty body, never a throw.
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
  if (bodyHtml === null || bodyHtmlFeed === null) {
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
