import { EditIcon, ExternalLinkIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react'
import { type DragEvent, Fragment, memo } from 'react'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { Skeleton } from '@/ui/components/skeleton'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'

interface CategoryRowProps {
  category: AdminCategoryDto
  dragEnabled: boolean
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropOnRow: (id: string) => void
  onEdit: () => void
  onDelete: () => void
}

export const CategoryRow = memo(function CategoryRow({
  category,
  dragEnabled,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOnRow,
  onEdit,
  onDelete,
}: CategoryRowProps) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!dragEnabled) {
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', category.id)
    onDragStart(category.id)
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragEnabled) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!dragEnabled) {
      return
    }
    event.preventDefault()
    onDropOnRow(category.id)
  }

  return (
    <div
      draggable={dragEnabled}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-dragging={isDragging ? 'true' : undefined}
      className={cn(
        'group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50',
        isDragging && 'opacity-50',
      )}
    >
      {/* Drag handle */}
      <span
        className={
          dragEnabled
            ? 'flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing'
            : 'flex size-6 shrink-0 cursor-not-allowed items-center justify-center rounded-sm text-muted-foreground/40'
        }
        aria-label="拖拽排序"
      >
        <GripVerticalIcon className="size-4" />
      </span>

      {/* Cover */}
      <div className="relative aspect-[16/10] w-(--spacing-admin-thumb) flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {category.cover ? (
          <img src={category.cover} alt={category.name} className="size-full object-cover" loading="lazy" />
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
      <span className="hidden w-(--spacing-admin-col-narrow) shrink-0 justify-end text-(--text-admin-sm) text-muted-foreground tabular-nums md:flex">
        {category.postCount}
      </span>

      {/* Edit CTA */}
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title="编辑"
      >
        <EditIcon className="size-4" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
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
            <Skeleton className="aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-4 w-(--spacing-admin-col-narrow) md:block" />
            <Skeleton className="h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) rounded-md" />
            <Skeleton className="h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) rounded-md" />
          </div>
        </Fragment>
      ))}
    </div>
  )
}
