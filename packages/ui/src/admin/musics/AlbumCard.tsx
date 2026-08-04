import type { AdminMusicDto } from '@kobato/shared/contracts/music'

import { Equalizer } from '@kobato/ui/admin/musics/Equalizer'
import { useMusicPlayerActions, useMusicPlayerState } from '@kobato/ui/admin/musics/MusicPlayerContext'
import { cn } from '@kobato/ui/lib/cn'
import { Image } from '@kobato/ui/public/widgets/Image'
import { Play, Pause } from 'lucide-react'

export interface AlbumCardProps {
  music: AdminMusicDto
  viewTransitionName?: string
}

export function AlbumCard({ music, viewTransitionName }: AlbumCardProps) {
  const { currentTrack, isPlaying } = useMusicPlayerState()
  const { load, toggle } = useMusicPlayerActions()
  const isCurrent = currentTrack?.id === music.id
  const isCurrentPlaying = isCurrent && isPlaying

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCurrent) {
      toggle()
    } else {
      load(music)
    }
  }

  return (
    <div className="group">
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden rounded-lg shadow-md transition-shadow duration-200 group-hover:shadow-xl">
        {music.coverUrl ? (
          <Image
            src={music.coverUrl}
            alt={music.name}
            width={300}
            height={300}
            className={cn('h-full w-full object-cover transition-transform duration-300', 'group-hover:scale-105')}
            style={viewTransitionName ? { viewTransitionName } : undefined}
          />
        ) : (
          <div className="h-full w-full bg-surface-dim" />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-end justify-end bg-black/0 p-3 transition-all duration-200 group-hover:bg-black/40">
          <button
            type="button"
            onClick={handlePlay}
            className={cn(
              'flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
              'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
              'transition-all duration-200',
            )}
            aria-label={isCurrentPlaying ? '暂停' : '播放'}
          >
            {isCurrentPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
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
        <p
          className="truncate text-sm font-semibold text-ink-1"
          style={viewTransitionName ? { viewTransitionName: viewTransitionName.replace('cover', 'title') } : undefined}
        >
          {music.name}
        </p>
        <p
          className="truncate text-xs text-ink-3"
          style={viewTransitionName ? { viewTransitionName: viewTransitionName.replace('cover', 'artist') } : undefined}
        >
          {music.artist.join(' / ')}
        </p>
      </div>
    </div>
  )
}
