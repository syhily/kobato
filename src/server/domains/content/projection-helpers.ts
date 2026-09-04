import type { ContentRow } from '@/server/infra/db/types'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { validatePortableTextBody } from '@/shared/pt/utils'
import { readStringArray } from '@/shared/utils/tools'
import { isRecord } from '@/shared/utils/type-guards'

// Validate the `json` blob — a corrupted one must never blank the public site.
export function readBody(value: unknown): PortableTextBody {
  if (value === null || value === undefined) {
    return []
  }
  return validatePortableTextBody(value)
}

/**
 * The Lexical twin of `readBody` for the ADMIN revision DTO (the save
 * pipeline stores Lexical states from R9a on). The read-side projections
 * below stay on `readBody` until the R13/R14 read-path switch; a PT-era row
 * read through this function fails loudly — the R15 backfill is what makes
 * every stored row Lexical.
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
 */
export function readRevisionProjection(revision: ContentRow | null): {
  body: PortableTextBody
  imageSources: string[]
  headings: MarkdownHeading[]
} {
  return {
    body: revision !== null ? readBody(revision.body) : [],
    imageSources: revision !== null ? readStringArray(revision.imageSources) : [],
    headings: revision !== null ? readHeadings(revision.headings) : [],
  }
}
