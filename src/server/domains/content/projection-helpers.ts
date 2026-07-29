import type { ContentRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { validatePortableTextBody } from '@/shared/pt/utils'
import { readStringArray } from '@/shared/utils/tools'
import { isRecord } from '@/shared/utils/type-guards'

// `content.body` is `text({ mode: 'json' })` so Drizzle hands it to us
// as `unknown`. Round-trip through `validatePortableTextBody` so a
// corrupted blob (e.g. a direct INSERT) never blanks the public site.
export function readBody(value: unknown): PortableTextBody {
  if (value === null || value === undefined) {
    return []
  }
  return validatePortableTextBody(value)
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
 * The revision-joined CMS fields both catalog projections (`toCmsPost`,
 * `toCmsPage`) derive identically: the PT body, the image-source list,
 * and the heading anchors — each empty when the entity has no published
 * revision yet.
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
