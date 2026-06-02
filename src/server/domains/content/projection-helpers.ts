import type { MarkdownHeading, PortableTextBody } from '@/shared/types/catalog'

import { validatePortableTextBody } from '@/shared/pt/utils'

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
    if (entry === null || typeof entry !== 'object') {
      continue
    }
    const item = entry as Record<string, unknown>
    if (typeof item.depth !== 'number' || typeof item.text !== 'string') {
      continue
    }
    out.push({
      depth: item.depth,
      text: item.text,
      slug: typeof item.slug === 'string' ? item.slug : '',
    })
  }
  return out
}
