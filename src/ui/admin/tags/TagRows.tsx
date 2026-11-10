import { SquarePenIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'

import type { AdminTagDto } from '@/shared/contracts/tags'

import { Skeleton } from '@/ui/components/skeleton'
import { TableCell, TableRow } from '@/ui/components/table'
import { useI18n } from '@/ui/lib/I18nProvider'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'

interface TagRowProps {
  tag: AdminTagDto
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}

export const TagRow = memo(function TagRow({ tag, disabled, onEdit, onDelete }: TagRowProps) {
  const { t } = useI18n()
  return (
    <TableRow>
      <TableCell className="py-5">
        <span>{tag.name}</span>
      </TableCell>
      <TableCell className="py-5">
        <span className="text-sm text-muted-foreground">{tag.slug}</span>
      </TableCell>
      <TableCell className="py-5">
        <Link
          to={`/admin/posts?tag=${encodeURIComponent(tag.name)}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('admin.categories.postCount', { count: tag.postCount })}
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4 text-right">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={t('common.action.edit')}
            aria-label={t('admin.tags.row.edit', { name: tag.name })}
          >
            <SquarePenIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            title={t('common.action.delete')}
            aria-label={t('admin.tags.row.delete', { name: tag.name })}
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
})

export function TagsSkeleton() {
  return (
    <>
      {skeletonKeys(6).map((key) => (
        <TableRow key={key}>
          <TableCell className="py-5" colSpan={3}>
            <Skeleton className="h-4 w-1/3" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
