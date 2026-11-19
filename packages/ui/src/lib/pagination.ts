// Page-window algorithm shared by the public site and the admin shell —
// the same chip ladder so `/page/3` reads identically in both.
// Inputs / outputs are 1-based; admin callers `+1` / `-1` around calls.

export const DENSE_THRESHOLD = 6

export type PageWindowItem = number | 'ellipsis'

export interface PageWindowOptions {
  current: number
  total: number
}

export function computePageWindow({ current, total }: PageWindowOptions): PageWindowItem[] {
  if (total <= 1) {
    return []
  }
  if (total <= DENSE_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
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
