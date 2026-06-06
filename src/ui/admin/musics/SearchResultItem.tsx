import { Loader2Icon, PlayIcon, PlusIcon, SquareIcon } from 'lucide-react'

import type { MetingSearchHit } from '@/shared/types/music'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

export interface PreviewProgress {
  duration: number | null
  currentTime: number
}

export const INITIAL_PREVIEW_PROGRESS: PreviewProgress = { duration: null, currentTime: 0 }

function formatSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return '--:--'
  }
  const total = Math.floor(value)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export interface SearchResultItemProps {
  hit: MetingSearchHit & { previewUrl?: string; _added?: boolean }
  previewActive: boolean
  adding: boolean
  added: boolean
  previewProgress: PreviewProgress | null
  onPreview: (hit: MetingSearchHit & { previewUrl?: string }) => void
  onAdd: (hit: MetingSearchHit) => void
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void
}

export function SearchResultItem({
  hit,
  previewActive,
  adding,
  added,
  previewProgress,
  onPreview,
  onAdd,
  onSeek,
}: SearchResultItemProps) {
  const totalDuration = previewProgress?.duration ?? null
  const currentTime = previewProgress?.currentTime ?? 0
  const ratio = totalDuration !== null && totalDuration > 0 ? Math.min(1, Math.max(0, currentTime / totalDuration)) : 0

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-2">
      <div className="flex items-center gap-3">
        {hit.coverUrl !== '' ? (
          <img src={hit.coverUrl} alt="" className="size-12 shrink-0 rounded object-cover" loading="lazy" />
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPreview(hit)}
            disabled={hit.previewUrl === undefined || hit.previewUrl === ''}
          >
            {previewActive ? <SquareIcon /> : <PlayIcon />}
            {previewActive ? '停止' : '试听'}
          </Button>
          <Button type="button" size="sm" onClick={() => onAdd(hit)} disabled={adding || added}>
            {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {added ? '已添加' : adding ? '添加中' : '添加'}
          </Button>
        </div>
      </div>
      {previewActive ? (
        // Click-to-seek progress bar. Disabled visually
        // until `loadedmetadata` populates `duration` so
        // the operator does not seek into a NaN clip.
        <div className="flex items-center gap-2 pl-15">
          <span className="w-9 shrink-0 text-right font-mono text-(--text-micro) text-muted-foreground tabular-nums">
            {formatSeconds(currentTime)}
          </span>
          <div
            // Custom click-to-seek progress bar. `<input type="range">`
            // would lose the styled track + per-pixel click handler.
            role="slider"
            aria-label="预览进度"
            aria-valuemin={0}
            aria-valuemax={totalDuration ?? 0}
            aria-valuenow={currentTime}
            aria-valuetext={`${formatSeconds(currentTime)} / ${formatSeconds(totalDuration)}`}
            aria-disabled={totalDuration === null || undefined}
            tabIndex={totalDuration !== null ? 0 : -1}
            onClick={onSeek}
            className={cn(
              'relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted',
              totalDuration !== null ? 'cursor-pointer hover:bg-muted/80' : 'cursor-not-allowed opacity-60',
            )}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${(ratio * 100).toFixed(2)}%` }}
            />
          </div>
          <span className="w-9 shrink-0 font-mono text-(--text-micro) text-muted-foreground tabular-nums">
            {formatSeconds(totalDuration)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
