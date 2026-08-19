import { z } from 'zod'

export const idString = z.string().regex(/^\d+$/, 'numeric id required')
export const isoDateTime = z.iso.datetime()

export const markdownHeadingDto = z.object({
  depth: z.number().int().min(1).max(6),
  slug: z.string(),
  text: z.string(),
})

// Used by the settings system (shared/config, settings registry, and the
// admin settings route) for compile-time equality checks.
// The inner `<T>()` variance wrappers are load-bearing — inlining them would
// degrade the strict equality check to mutual assignability. False positive.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
export type Assert<T extends true> = T
