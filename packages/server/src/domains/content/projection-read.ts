import type { ContentRow } from '@kobato/db/types'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { MarkdownHeading } from '@kobato/inkling/headless/toc'

import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { readStringArray } from '@kobato/server/infra/coerce'
import { isRecord } from '@kobato/utils/type-guards'

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
