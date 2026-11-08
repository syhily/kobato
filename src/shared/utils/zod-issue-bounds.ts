// The numeric bounds Zod attaches to a validation issue, shaped for catalog
// placeholders (`{min}` / `{max}`). Isomorphic: the server maps them into a
// wire descriptor, the client interpolates them into a localized field error.

export type ZodIssueBounds = Record<string, number>

/**
 * `too_small` carries `minimum`, `too_big` carries `maximum`; other issue
 * kinds carry neither. Non-finite values (Zod also allows bigint bounds here)
 * are dropped — the catalogs speak seconds/counts, never bigints.
 */
export function zodIssueBounds(issue: unknown): ZodIssueBounds | undefined {
  if (typeof issue !== 'object' || issue === null) {
    return undefined
  }
  const bounds: ZodIssueBounds = {}
  if ('minimum' in issue && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum)) {
    bounds.min = issue.minimum
  }
  if ('maximum' in issue && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum)) {
    bounds.max = issue.maximum
  }
  return Object.keys(bounds).length === 0 ? undefined : bounds
}
