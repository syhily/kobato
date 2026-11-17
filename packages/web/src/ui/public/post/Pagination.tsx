import { computePageWindow } from '@kobato/shared/utils/pagination.ts'
import { chipActive, chipBase, chipResting } from '@kobato/ui/components/pagination.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { MoreHorizontalIcon } from 'lucide-react'
import { Link } from 'react-router'

export interface PaginationProps {
  current: number
  total: number
  rootPath: string
}

export function Pagination({ current, total, rootPath }: PaginationProps) {
  const { t } = useI18n()
  const items = computePageWindow({ current, total })
  if (items.length === 0) {
    return null
  }
  return (
    <nav
      aria-label={t('public.posts.paginationLabel')}
      data-slot="pagination"
      className="navigation mx-auto flex w-full justify-center"
    >
      <ul data-slot="pagination-content" className="flex flex-row flex-wrap items-center justify-center gap-2">
        {items.map((item, i) => {
          // Key ellipsis slots by neighbouring page numbers so the key is stable across list lengths.
          const prev = items[i - 1]
          const next = items[i + 1]
          const ellipsisKey = `ellipsis-${prev ?? 'start'}-${next ?? 'end'}`
          return item === 'ellipsis' ? (
            <Ellipsis key={ellipsisKey} />
          ) : (
            <PageItem key={item} pageNum={item} current={current} rootPath={rootPath} />
          )
        })}
      </ul>
    </nav>
  )
}

function Ellipsis() {
  const { t } = useI18n()
  return (
    <li data-slot="pagination-item">
      <span
        aria-hidden
        data-slot="pagination-ellipsis"
        className={cn(chipBase, chipResting, 'cursor-default hover:bg-chip-hover-bg hover:text-chip-hover-fg')}
      >
        <MoreHorizontalIcon className="size-4" aria-hidden />
        <span className="sr-only">{t('public.posts.more')}</span>
      </span>
    </li>
  )
}

interface PageItemProps {
  current: number
  pageNum: number
  rootPath: string
}

function PageItem({ current, pageNum, rootPath }: PageItemProps) {
  const isCurrent = current === pageNum
  if (isCurrent) {
    return (
      <li data-slot="pagination-item">
        <span aria-current="page" data-slot="pagination-link" data-active className={cn(chipBase, chipActive)}>
          {pageNum}
        </span>
      </li>
    )
  }
  const base = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath
  const to = pageNum === 1 ? rootPath : `${base}/page/${pageNum}`
  const prefetch = Math.abs(pageNum - current) === 1 ? 'render' : 'intent'
  return (
    <li data-slot="pagination-item">
      <Link data-slot="pagination-link" className={cn(chipBase, chipResting)} to={to} prefetch={prefetch}>
        {pageNum}
      </Link>
    </li>
  )
}
