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

/** Shared admin pagination over the shadcn `Pagination` primitive.
 *  API is 0-based; `computePageWindow` is 1-based, so ±1 at the boundary. */
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
          // Disambiguate the (at most two) ellipsis slots by their window edge — key stays stable.
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
