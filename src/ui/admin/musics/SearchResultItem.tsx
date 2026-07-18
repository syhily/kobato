import { Loader2Icon, Pause, Play, PlusIcon } from 'lucide-react'

import type { MetingSearchHit } from '@/shared/types/music'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

export interface SearchResultItemProps {
  hit: MetingSearchHit
  previewActive: boolean
  adding: boolean
  added: boolean
  onPreview: (hit: MetingSearchHit) => void
  onAdd: (hit: MetingSearchHit) => void
}

export function SearchResultItem({ hit, previewActive, adding, added, onPreview, onAdd }: SearchResultItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      {hit.coverUrl !== '' ? (
        <Image
          src={hit.coverUrl}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="size-12 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{hit.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {hit.artist.join(' / ')}
          {hit.album !== '' ? ` · ${hit.album}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview(hit)}
          disabled={hit.previewUrl === undefined || hit.previewUrl === ''}
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-colors',
            previewActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            (hit.previewUrl === undefined || hit.previewUrl === '') && 'cursor-not-allowed opacity-40',
          )}
          aria-label={previewActive ? '停止' : '试听'}
        >
          {previewActive ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        </button>
        <Button type="button" size="sm" onClick={() => onAdd(hit)} disabled={adding || added}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {added ? '已添加' : adding ? '添加中' : '添加'}
        </Button>
      </div>
    </div>
  )
}
