import type { InklingDocument } from '@/shared/inkling/schema'
import type { MarkdownHeading } from '@/shared/types/catalog'

import { createEmptyInklingDocument } from '@/shared/inkling/empty'
import { validateInklingDocument } from '@/shared/inkling/schema'
import { isRecord } from '@/shared/utils/type-guards'

// `content.body` is `jsonb` so Drizzle hands it to us as `unknown`.
// We round-trip through `validateInklingDocument` so the SSR /
// editor never sees a malformed payload — saving a corrupted blob
// shouldn't be possible (the API perimeter validates), but defending
// the read path keeps a future direct-INSERT bug from blanking the
// public site.
export function readBody(value: unknown): InklingDocument {
  if (value === null || value === undefined) {
    return createEmptyInklingDocument()
  }
  return validateInklingDocument(value)
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
