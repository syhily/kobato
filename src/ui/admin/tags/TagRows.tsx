import { EditIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'

import type { AdminTagDto } from '@/shared/types/tags'

import { Button } from '@/ui/components/button'
import { Skeleton } from '@/ui/components/skeleton'
import { TableCell, TableRow } from '@/ui/components/table'

const DEFAULT_OG_IMAGE = '/images/open-graph.png'

interface TagRowProps {
  tag: AdminTagDto
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}

export const TagRow = memo(function TagRow({ tag, disabled, onEdit, onDelete }: TagRowProps) {
  const ogImageUrl = tag.ogImage || DEFAULT_OG_IMAGE

  return (
    <TableRow>
      <TableCell className="py-4">
        <div className="relative aspect-[1200/630] w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          <img src={ogImageUrl} alt={tag.name} className="size-full object-cover" loading="lazy" />
        </div>
      </TableCell>
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
          {tag.postCount} 篇
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4 text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={disabled}
            aria-label={`编辑标签 ${tag.name}`}
          >
            <EditIcon />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`删除标签 ${tag.name}`}
          >
            <Trash2Icon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
})

export function TagsSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        // Skeleton rows — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={i}>
          <TableCell className="py-4">
            <Skeleton className="aspect-[1200/630] w-16 rounded-md" />
          </TableCell>
          <TableCell className="py-5" colSpan={4}>
            <Skeleton className="h-4 w-1/3" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
