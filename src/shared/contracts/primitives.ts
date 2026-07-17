import { z } from 'zod'

import type { MarkdownHeading } from '@/shared/utils/toc'

// ─── primitive wire helpers ────────────────────────────
export const idString = z.string().regex(/^\d+$/, 'numeric id required')
export const isoDateTime = z.iso.datetime()

// ─── markdown / portable-text ──────────────────────────
export const markdownHeadingDto = z.object({
  depth: z.number().int().min(1).max(6),
  slug: z.string(),
  text: z.string(),
})

// ─── parity assertion helpers ──────────────────────────
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
export type Assert<T extends true> = T

// ─── parity assertions ─────────────────────────────────
type _markdownHeadingDtoParity = Assert<Equals<z.infer<typeof markdownHeadingDto>, MarkdownHeading>>
