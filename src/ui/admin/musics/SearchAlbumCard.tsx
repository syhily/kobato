import { Loader2, Pause, Play, Plus } from 'lucide-react'

import type { MetingSearchHit } from '@/shared/types/music'

import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      <div className="h-3 w-0.5 animate-equalizer rounded-sm" />
      <div className="h-2 w-0.5 animate-equalizer-delay-1 rounded-sm" />
      <div className="h-4 w-0.5 animate-equalizer-delay-2 rounded-sm" />
    </div>
  )
}

export interface SearchAlbumCardProps {
  hit: MetingSearchHit
  adding: boolean
  added: boolean
  isCurrent: boolean
  isPlaying: boolean
  onAdd: (hit: MetingSearchHit) => void
  onPreview: (hit: MetingSearchHit) => void
}

export function SearchAlbumCard({ hit, adding, added, isCurrent, isPlaying, onAdd, onPreview }: SearchAlbumCardProps) {
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!adding && !added) {
      onAdd(hit)
    }
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview(hit)
  }

  const hasPreview = !!hit.previewUrl
  const isCurrentPlaying = isCurrent && isPlaying

  return (
    <div className="group">
      {/* Cover */}
      <div
        className={cn(
          'relative aspect-square overflow-hidden rounded-lg shadow-md transition-shadow duration-200 group-hover:shadow-xl',
        )}
      >
        {hit.coverUrl ? (
          <Image
            src={hit.coverUrl}
            alt={hit.name}
            width={300}
            height={300}
            className={cn('h-full w-full object-cover transition-transform duration-300', 'group-hover:scale-105')}
          />
        ) : (
          <div className="h-full w-full bg-surface-dim" />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 p-3 transition-all duration-200 group-hover:bg-black/40">
          {/* Play button — bottom-right, matches AlbumCard */}
          {hasPreview && (
            <button
              type="button"
              onClick={handlePreview}
              className={cn(
                'absolute right-3 bottom-3 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
                'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
                'transition-all duration-200',
                isCurrentPlaying && 'translate-y-0 opacity-100',
              )}
              aria-label={isCurrentPlaying ? '暂停' : '播放'}
            >
              {isCurrentPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
            </button>
          )}

          {/* Add button — bottom-left */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || added}
            className={cn(
              'absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-full shadow-lg',
              'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
              'transition-all duration-200',
              added ? 'bg-status-success-bg text-status-success-fg' : 'bg-surface text-ink-1 hover:bg-surface-dim',
            )}
            aria-label={added ? '已添加' : '添加音乐'}
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
          </button>
        </div>

        {/* Playing indicator */}
        {isCurrentPlaying && (
          <div className="absolute bottom-2 left-2">
            <Equalizer />
          </div>
        )}

        {/* Active ring */}
        {isCurrent && <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-primary" />}
      </div>

      {/* Info */}
      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-semibold text-ink-1">{hit.name}</p>
        <p className="truncate text-xs text-ink-3">{hit.artist.join(' / ')}</p>
        {hit.album && <p className="truncate text-xs text-ink-4">{hit.album}</p>}
      </div>
    </div>
  )
}
