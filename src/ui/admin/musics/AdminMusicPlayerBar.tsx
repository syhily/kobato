import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useLocation } from 'react-router'

import { formatTime } from '@/ui/admin/musics/format-time'
import { useMusicPlayer } from '@/ui/admin/musics/MusicPlayerContext'
import { ProgressSlider } from '@/ui/admin/musics/ProgressSlider'
import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

export function AdminMusicPlayerBar() {
  const location = useLocation()
  const isMusicPage = location.pathname.startsWith('/admin/library/music')
  const {
    currentTrack,
    isPlaying,
    duration,
    currentTime,
    volume,
    muted,
    extractedColor,
    toggle,
    seek,
    setVolume,
    toggleMute,
    close,
    playIndex,
    currentIndex,
    playlist,
  } = useMusicPlayer()

  const visible = currentTrack !== null && isMusicPage

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      playIndex(currentIndex - 1)
    }
  }, [currentIndex, playIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < playlist.length - 1) {
      playIndex(currentIndex + 1)
    }
  }, [currentIndex, playlist.length, playIndex])

  const accent = extractedColor ?? 'var(--brand)'
  const playButtonStyle = useMemo(() => ({ backgroundColor: accent }), [accent])

  if (!visible) {
    return null
  }

  return (
    <div className={cn('relative z-[1100] h-20 shrink-0 border-t border-line', 'bg-canvas/95 backdrop-blur-xl')}>
      <div className="flex h-full items-center px-4">
        {/* Left: Cover + Info */}
        <div className="flex w-auto min-w-0 items-center gap-3 md:w-[30%]">
          {currentTrack.coverUrl ? (
            <Image
              src={currentTrack.coverUrl}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <div className="size-14 shrink-0 rounded-sm bg-surface-dim" />
          )}
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-semibold text-ink-1">{currentTrack.name}</p>
            <p className="truncate text-xs text-ink-3">{currentTrack.artist.join(' / ')}</p>
          </div>
        </div>

        {/* Center: Controls + Progress */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              className="text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-30"
              aria-label="上一首"
            >
              <SkipBack className="size-5 fill-current" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex size-10 items-center justify-center rounded-full text-primary-foreground transition-transform hover:scale-105"
              style={playButtonStyle}
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= playlist.length - 1}
              className="text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-30"
              aria-label="下一首"
            >
              <SkipForward className="size-5 fill-current" />
            </button>
          </div>

          <div className="flex w-full items-center gap-2 md:max-w-md">
            <span className="w-10 text-right text-micro text-ink-4">{formatTime(currentTime)}</span>
            <ProgressSlider
              value={currentTime}
              max={duration || 100}
              onChange={seek}
              accent={accent}
              className="flex-1"
              ariaLabel="播放进度"
            />
            <span className="w-10 text-micro text-ink-4">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume + Close */}
        <div className="flex w-auto min-w-0 items-center justify-end gap-3 md:w-[30%]">
          <div className="group/volume relative flex items-center">
            <button
              type="button"
              onClick={toggleMute}
              className="text-ink-3 transition-colors hover:text-ink-1"
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            {/* Vertical volume slider — appears on hover with delay */}
            <div className="pointer-events-none absolute right-1/2 bottom-full translate-x-1/2 pb-2 opacity-0 transition-opacity delay-100 duration-200 group-hover/volume:pointer-events-auto group-hover/volume:opacity-100">
              <div className="flex h-28 w-8 flex-col items-center justify-center rounded-lg bg-surface-dim p-2 shadow-lg">
                <ProgressSlider
                  value={muted ? 0 : volume}
                  max={1}
                  onChange={setVolume}
                  accent={accent}
                  orientation="vertical"
                  ariaLabel="音量"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-ink-4 transition-colors hover:text-ink-1"
            aria-label="关闭播放器"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
