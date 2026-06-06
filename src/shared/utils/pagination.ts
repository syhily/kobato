// Page-window algorithm shared by the public site and the admin shell.
// Both surfaces compose the same chip ladder so a `/page/3` link reads
// identically in `/admin/posts` and on the public archive.
//
// Inputs / outputs are 1-based. Admin callers must `+1` before invoking
// and `-1` on click.

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

/** Compute the rendered page-chip sequence for `current` of `total`. */
export function computePageWindow({ current, total }: PageWindowOptions): PageWindowItem[] {
  if (total <= 1) {
    return []
  }
  if (total <= DENSE_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  // Windowed layout — three mutually exclusive branches when total >= 7:
  // nearStart covers pages 1-4, nearEnd covers the last four pages,
  // and the middle covers the rest.
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
