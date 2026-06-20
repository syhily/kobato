import type { InklingDocument } from '@/shared/inkling/schema'
import type { MarkdownHeading } from '@/shared/types/catalog'

import { getLogger } from '@/server/infra/logger'
import { createEmptyInklingDocument } from '@/shared/inkling/empty'
import { validateInklingDocument } from '@/shared/inkling/schema'
import { isRecord } from '@/shared/utils/type-guards'

// `content.body` is `jsonb` so Drizzle hands it to us as `unknown`.
// We round-trip through `validateInklingDocument` so the SSR /
// editor never sees a malformed payload — saving a corrupted blob
// shouldn't be possible (the API perimeter validates), but defending
// the read path keeps a future direct-INSERT bug from blanking the
// public site.
//
// During the PT→Inkling migration window (plan P7), some rows may still
// hold legacy PortableText arrays. Rather than 500 on the read path
// (the oRPC `.output(inklingDocumentSchema)` would surface a parse
// failure as an internal error), we fall back to an empty document so
// the page still renders and the body can be migrated later. Once P7
// ships and the G5 grep gate passes, this fallback can be tightened
// back to a hard throw.
export function readBody(value: unknown): InklingDocument {
  if (value === null || value === undefined) {
    return createEmptyInklingDocument()
  }
  try {
    return validateInklingDocument(value)
  } catch (err) {
    getLogger('content.projection').warn('body failed inkling validation, falling back to empty document', {
      error: err instanceof Error ? err.message : String(err),
    })
    return createEmptyInklingDocument()
  }
}

// `readBody` is also used to read comment bodies, which have the same
// legacy-PT migration concern. Re-exported under a comment-specific name
// so call sites document their intent.
export const readCommentBody = readBody

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
