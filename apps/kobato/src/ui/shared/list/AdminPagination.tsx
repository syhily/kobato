import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@kobato/ui/components/pagination'
import { computePageWindow } from '@kobato/ui/lib/pagination'
import { useMemo } from 'react'

interface AdminPaginationProps {
  totalPages: number
  currentPage: number
  onChange: (page: number) => void
}

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
