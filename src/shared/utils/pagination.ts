// Page-window algorithm shared by the public site and the admin shell —
// the same chip ladder so `/page/3` reads identically in both.
// Inputs / outputs are 1-based; admin callers `+1` / `-1` around calls.

/** Threshold above which we switch from dense to windowed layout. */
export const DENSE_THRESHOLD = 6

/** A single chip in the rendered ladder: a 1-based page number, or the
 *  literal `'ellipsis'` sentinel for the gap separator. */
export type PageWindowItem = number | 'ellipsis'

export interface PageWindowOptions {
  /** 1-based current page. Must be in `[1, total]`. */
  current: number
  /** Total number of pages. `total < 2` returns an empty array. */
  total: number
}

export function computePageWindow({ current, total }: PageWindowOptions): PageWindowItem[] {
  if (total <= 1) {
    return []
  }
  if (total <= DENSE_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  // Windowed layout — three branches: near the start, near the end, or the middle (total >= 7).
  const nearStart = current < 5
  const nearEnd = current > total - 4

  if (nearStart) {
    return [1, 2, 3, 4, 5, 'ellipsis', total]
  }
  if (nearEnd) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}
