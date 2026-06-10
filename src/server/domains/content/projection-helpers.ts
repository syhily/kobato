import type { MarkdownHeading, PortableTextBody } from '@/shared/types/catalog'

import { validatePortableTextBody } from '@/shared/pt/utils'
import { isRecord } from '@/shared/utils/type-guards'

// `content.body` is `jsonb` so Drizzle hands it to us as `unknown`.
// We round-trip through `validatePortableTextBody` so the SSR /
// editor never sees a malformed payload — saving a corrupted blob
// shouldn't be possible (the API perimeter validates), but defending
// the read path keeps a future direct-INSERT bug from blanking the
// public site.
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
