import { useMemo } from 'react'

import { computePageWindow } from '@/shared/utils/pagination'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/ui/components/pagination'

interface AdminPaginationProps {
  /** Total number of pages (>=1). The component renders nothing when total <= 1. */
  totalPages: number
  /** Zero-based current page. */
  currentPage: number
  onChange: (page: number) => void
}

/**
 * Shared admin pagination control. Replaces the in-file `PaginationBar` /
 * `UsersPagination` copies that previously lived inside `CommentsView` and
 * `UsersView`. Renders the shadcn `Pagination` primitive with the same
 * chip ladder the public site renders.
 *
 * Layout is congruent with the public-site pagination
 * (`src/ui/post/pagination/Pagination.tsx`) — both surfaces render
 * the chip sequence produced by `computePageWindow` (1-based,
 * "DENSE up to 6 / WINDOWED with [first, ..., neighbours, ..., last]"
 * thereafter), and neither carries prev/next chevrons.
 *
 * Index conventions:
 *   - The component's external API stays 0-based (`currentPage`,
 *     `onChange(page)`) because the rest of the admin business code
 *     (`useCommentsController`, `loadXxx({
 *     offset: page * pageSize })`) is 0-based.
 *   - Internally we add 1 before calling `computePageWindow`
 *     (which is 1-based) and subtract 1 when wiring the click
 *     callback, so admin business code never sees the 1-based
 *     surface.
 */
export function AdminPagination({ totalPages, currentPage, onChange }: AdminPaginationProps) {
  const items = useMemo(
    () => computePageWindow({ current: currentPage + 1, total: totalPages }),
    [currentPage, totalPages],
  )
  if (items.length === 0) {
    return null
  }
  return (
    <Pagination>
      <PaginationContent>
        {items.map((item, i) => {
          // Disambiguate the (at most two) ellipsis slots by their window
          // edge — `i` alone would be a positional key, but pairing the
          // ellipsis with the neighbouring page number makes it stable
          // regardless of list length.
          const prev = items[i - 1]
          const next = items[i + 1]
          const ellipsisKey = `ellipsis-${prev ?? 'start'}-${next ?? 'end'}`
          return item === 'ellipsis' ? (
            <PaginationItem key={ellipsisKey}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink isActive={item === currentPage + 1} onClick={() => onChange(item - 1)}>
                {item}
              </PaginationLink>
            </PaginationItem>
          )
        })}
      </PaginationContent>
    </Pagination>
  )
}
