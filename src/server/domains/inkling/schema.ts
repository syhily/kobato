import type { InklingDocument } from '@/shared/inkling/schema'

import { inklingDocumentSchema } from '@/shared/inkling/schema'

/**
 * Server-side perimeter parse for an Inkling document. Throws on invalid input
 * so API endpoints fail fast before persisting corrupt data.
 */
export function parseInklingDocument(value: unknown): InklingDocument {
  return inklingDocumentSchema.parse(value)
}

/**
 * Safe server-side parse for an Inkling document. Use this when the caller
 * wants to surface validation errors to the client instead of throwing.
 */
export function safeParseInklingDocument(
  value: unknown,
): { ok: true; document: InklingDocument } | { ok: false; error: string } {
  const result = inklingDocumentSchema.safeParse(value)
  if (result.success) {
    return { ok: true, document: result.data }
  }
  return { ok: false, error: result.error.message }
}
