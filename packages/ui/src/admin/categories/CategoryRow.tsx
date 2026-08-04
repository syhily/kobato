import type { AdminCategoryDto } from '@kobato/shared/contracts/categories'

import { useSortableRow } from '@kobato/ui/admin/shared/sortable'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { Tooltip } from '@kobato/ui/components/tooltip'
import { cn } from '@kobato/ui/lib/cn'
import { Image } from '@kobato/ui/public/widgets/Image'
import { ExternalLinkIcon, GripVerticalIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { Fragment, memo } from 'react'
import { Link } from 'react-router'

interface CategoryRowProps {
  category: AdminCategoryDto
  sortEnabled: boolean
  onEdit: () => void
  onDelete: () => void
}

export const CategoryRow = memo(function CategoryRow({ category, sortEnabled, onEdit, onDelete }: CategoryRowProps) {
  const { setNodeRef, style, isDragging, dragHandleProps } = useSortableRow({
    id: category.id,
    disabled: !sortEnabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50',
        isDragging && 'opacity-50',
      )}
    >
      {/* Drag handle — custom chrome (sizing + disabled state) over the shared
          dnd plumbing. */}
      <button
        type="button"
        {...dragHandleProps.attributes}
        {...dragHandleProps.listeners}
        className={
          sortEnabled
            ? 'flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing'
            : 'flex size-6 shrink-0 cursor-not-allowed items-center justify-center rounded-sm text-muted-foreground/40'
        }
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </button>

      {/* Cover */}
      <div className="relative aspect-[16/10] w-(--spacing-admin-thumb) flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {category.cover ? (
          <Image
            src={category.cover}
            alt={category.name}
            width={200}
            height={125}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="truncate font-semibold text-(--text-admin-base) hover:underline"
        >
          {category.name}
        </button>
        <p className="mt-0.5 flex items-center gap-1 truncate text-(--text-admin-sm) text-muted-foreground">
          <a
            href={`/cats/${category.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            <span className="font-mono">/cats/{category.slug}</span>
          </a>
          {category.description ? (
            <>
              <span>·</span>
              <CategoryDescription description={category.description} />
            </>
          ) : null}
        </p>
      </div>

      {/* Post count */}
      <Link
        to={`/admin/posts?category=${encodeURIComponent(category.id)}`}
        className="hidden w-(--spacing-admin-col-narrow) shrink-0 justify-end text-(--text-admin-sm) text-muted-foreground tabular-nums hover:text-foreground md:flex"
      >
        {category.postCount} 篇
      </Link>

      {/* Edit CTA */}
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title="编辑"
      >
        <SquarePenIcon className="size-4" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
        title="删除"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
})

interface CategoryDescriptionProps {
  description: string
}

function CategoryDescription({ description }: CategoryDescriptionProps) {
  return (
    <Tooltip placement="top">
      <Tooltip.Trigger
        as="button"
        type="button"
        className="cursor-help truncate text-left text-(--text-admin-sm) text-muted-foreground hover:text-foreground focus-visible:rounded-sm focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {description}
      </Tooltip.Trigger>
      <Tooltip.Content>{description}</Tooltip.Content>
    </Tooltip>
  )
}

export function CategoriesSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 4 }, (_, i) => (
        <Fragment key={`skeleton-${i}`}>
          <div className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="size-6 shrink-0 rounded-sm" />
            <Skeleton className="aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-4 w-(--spacing-admin-col-narrow) md:block" />
            <Skeleton className="h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) rounded-xl" />
            <Skeleton className="h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) rounded-xl" />
          </div>
        </Fragment>
      ))}
    </div>
  )
}
