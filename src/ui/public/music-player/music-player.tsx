import { ListMusicIcon, Loader2Icon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/ui/lib/cn'
import { useMediaQuery } from '@/ui/lib/use-media-query'
import { formatAudioDuration } from '@/ui/public/music-player/format-time'
import { LyricsPanel } from '@/ui/public/music-player/lyrics'
import { ScrubBar } from '@/ui/public/music-player/scrub-bar'
import { useMusicPlayback } from '@/ui/public/music-player/use-music-playback'

export type MusicPlayerCardProps = {
  name: string
  artist: string
  url: string
  cover?: string
  lrc?: string
  className?: string
}

const stopEvent = (event: React.SyntheticEvent) => event.stopPropagation()

export function MusicPlayerCard({ name, artist, url, cover, lrc, className }: MusicPlayerCardProps) {
  const playback = useMusicPlayback({ src: url })
  const [lyricsOpen, setLyricsOpen] = useState(false)
  // Touch has no hover (and iOS never focuses buttons on tap), so the
  // hover/focus-revealed slider would stay unreachable — keep it expanded.
  const isCoarsePointer = useMediaQuery('(hover: none)')

  const hasLrc = Boolean(lrc)
  const progress = playback.duration > 0 ? playback.currentTime / playback.duration : 0

  return (
    <div
      className={cn('not-typeset overflow-hidden rounded-md border border-line-muted bg-canvas select-none', className)}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          aria-label={playback.isPlaying ? '暂停' : '播放'}
          disabled={playback.hasError}
          className="group/cover relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-md bg-surface-dim"
          onClick={(event) => {
            event.stopPropagation()
            playback.togglePlay()
          }}
          onPointerDown={stopEvent}
        >
          {cover ? (
            <img className="size-full object-cover" src={cover} alt={name} />
          ) : (
            <span className="flex size-full items-center justify-center text-lg" aria-hidden="true">
              🎵
            </span>
          )}
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/30 text-white transition-opacity',
              playback.isPlaying || playback.isLoading ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100',
            )}
          >
            {playback.isLoading ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : playback.isPlaying ? (
              <PauseIcon className="size-5" />
            ) : (
              <PlayIcon className="size-5" />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-1">{name}</div>
          <div className="truncate text-xs text-ink-3">{artist}</div>
        </div>

        {hasLrc ? (
          <button
            type="button"
            aria-label="歌词"
            aria-pressed={lyricsOpen}
            className={cn(
              'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
              lyricsOpen ? 'text-brand' : 'text-ink-3 hover:text-ink-1',
            )}
            onClick={(event) => {
              event.stopPropagation()
              setLyricsOpen((open) => !open)
            }}
            onPointerDown={stopEvent}
          >
            <ListMusicIcon className="size-4" />
          </button>
        ) : null}

        <div className="group/volume flex shrink-0 items-center">
          <button
            type="button"
            aria-label={playback.muted ? '取消静音' : '静音'}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink-1"
            onClick={(event) => {
              event.stopPropagation()
              playback.toggleMuted()
            }}
            onPointerDown={stopEvent}
          >
            {playback.muted || playback.volume === 0 ? (
              <VolumeXIcon className="size-4" />
            ) : (
              <Volume2Icon className="size-4" />
            )}
          </button>
          {playback.isVolumeSupported ? (
            <div
              className={cn(
                'overflow-hidden transition-[width] duration-200',
                isCoarsePointer ? 'w-20' : 'w-0 group-focus-within/volume:w-20 group-hover/volume:w-20',
              )}
            >
              <ScrubBar
                ariaLabel="音量"
                className="w-20 pr-2"
                value={playback.muted ? 0 : playback.volume}
                onScrub={playback.setVolume}
                onSeek={playback.setVolume}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-1 text-xs text-ink-4 tabular-nums">
        <span className="w-9 shrink-0 whitespace-nowrap">{formatAudioDuration(playback.currentTime)}</span>
        <ScrubBar
          ariaLabel="播放进度"
          className="flex-1"
          value={progress}
          onSeek={(value) => playback.seek(value * playback.duration)}
        />
        <span className="w-9 shrink-0 text-right whitespace-nowrap">
          {playback.duration > 0 ? formatAudioDuration(playback.duration) : '--:--'}
        </span>
      </div>

      {lrc && lyricsOpen ? <LyricsPanel currentTime={playback.currentTime} lrc={lrc} onSeek={playback.seek} /> : null}
    </div>
  )
}
