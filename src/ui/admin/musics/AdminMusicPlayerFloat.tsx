import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

import { useMusicPlayer } from '@/ui/admin/musics/MusicPlayerContext'
import { ProgressSlider } from '@/ui/admin/musics/ProgressSlider'
import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

const STORAGE_KEY = 'kobato-admin-player-pos'

interface PlayerPosition {
  x: number
  y: number
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function loadPosition(): PlayerPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerPosition
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return { x: 0, y: 0 }
}

function savePosition(pos: PlayerPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // ignore
  }
}

export function AdminMusicPlayerFloat() {
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

  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState<PlayerPosition>({ x: 0, y: 0 })
  const [position, setPosition] = useState<PlayerPosition>({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = currentTrack !== null && !isMusicPage

  // Initialize position
  useEffect(() => {
    const saved = loadPosition()
    setPosition(saved)
  }, [])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setDragging(true)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const el = containerRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      setOffset({ x: clientX - rect.left, y: clientY - rect.top })
    }
  }, [])

  const stopPropagation = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
  }, [])

  useEffect(() => {
    if (!dragging) {
      return
    }

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const vw = window.innerWidth
      const vh = window.innerHeight
      const el = containerRef.current
      const w = el?.offsetWidth ?? 280
      const h = el?.offsetHeight ?? 56

      let x = clientX - offset.x
      let y = clientY - offset.y
      x = Math.max(0, Math.min(x, vw - w))
      y = Math.max(0, Math.min(y, vh - h))
      setPosition({ x, y })
    }

    const handleEnd = () => {
      setDragging(false)
      savePosition(position)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [dragging, offset, position])

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

  if (!visible) {
    return null
  }

  const accent = extractedColor ?? 'var(--brand)'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      className={cn(
        'fixed z-50 select-none',
        'md:top-auto md:right-4 md:bottom-4 md:left-auto',
        'top-auto right-2 bottom-[calc(var(--mobile-navbar-height)+0.5rem)] left-auto',
        expanded ? 'w-80' : 'w-auto',
        dragging && 'cursor-grabbing',
        !dragging && 'cursor-grab',
      )}
      style={{
        left: position.x || undefined,
        top: position.y || undefined,
        right: position.x ? 'auto' : undefined,
        bottom: position.y ? 'auto' : undefined,
      }}
    >
      {!expanded ? (
        // Collapsed pill
        <div
          className={cn(
            'flex h-14 items-center gap-2 rounded-full',
            'bg-canvas/80 shadow-xl ring-1 ring-line-muted backdrop-blur-2xl',
            'w-56 pr-4 pl-1',
          )}
        >
          {/* Spinning cover */}
          <div className="relative shrink-0">
            {currentTrack.coverUrl ? (
              <Image
                src={currentTrack.coverUrl}
                alt=""
                width={40}
                height={40}
                className={cn('size-10 rounded-full object-cover', isPlaying && 'animate-spin')}
                style={{ animationDuration: '6s' }}
              />
            ) : (
              <div className="size-10 rounded-full bg-surface-dim" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="truncate text-xs font-medium text-ink-1">{currentTrack.name}</p>
            <p className="truncate text-nano text-ink-4">{currentTrack.artist.join(' / ')}</p>
          </div>

          <button
            type="button"
            onClick={toggle}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            className="ml-1 shrink-0 text-ink-3 transition-colors hover:text-ink-1"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>

          <button
            type="button"
            onClick={() => setExpanded(true)}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            className="shrink-0 text-ink-4 transition-colors hover:text-ink-1"
            aria-label="展开播放器"
          >
            <ChevronUp className="size-4" />
          </button>
        </div>
      ) : (
        // Expanded card
        <div
          className={cn(
            'flex flex-col gap-3 rounded-2xl p-4',
            'bg-canvas/80 shadow-xl ring-1 ring-line-muted backdrop-blur-2xl',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-4">正在播放</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                className="text-ink-4 transition-colors hover:text-ink-1"
                aria-label="收起播放器"
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={close}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                className="text-ink-4 transition-colors hover:text-ink-1"
                aria-label="关闭播放器"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Cover + Info */}
          <div className="flex items-center gap-3">
            {currentTrack.coverUrl ? (
              <Image
                src={currentTrack.coverUrl}
                alt=""
                width={80}
                height={80}
                className="size-20 rounded-lg object-cover shadow-lg"
              />
            ) : (
              <div className="size-20 rounded-lg bg-surface-dim" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-1">{currentTrack.name}</p>
              <p className="truncate text-xs text-ink-3">{currentTrack.artist.join(' / ')}</p>
              <p className="truncate text-xs text-ink-4">{currentTrack.album}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handlePrev}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              disabled={currentIndex <= 0}
              className="text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-30"
              aria-label="上一首"
            >
              <SkipBack className="size-5 fill-current" />
            </button>
            <button
              type="button"
              onClick={toggle}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              className="flex size-12 items-center justify-center rounded-full text-primary-foreground transition-transform hover:scale-105"
              style={{ backgroundColor: accent }}
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
            </button>
            <button
              type="button"
              onClick={handleNext}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              disabled={currentIndex >= playlist.length - 1}
              className="text-ink-3 transition-colors hover:text-ink-1 disabled:opacity-30"
              aria-label="下一首"
            >
              <SkipForward className="size-5 fill-current" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <span className="w-9 text-right text-nano text-ink-4">{formatTime(currentTime)}</span>
            <ProgressSlider
              value={currentTime}
              max={duration || 100}
              onChange={seek}
              accent={accent}
              className="flex-1"
              ariaLabel="播放进度"
            />
            <span className="w-9 text-nano text-ink-4">{formatTime(duration)}</span>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              className="text-ink-3 transition-colors hover:text-ink-1"
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <ProgressSlider
              value={muted ? 0 : volume}
              max={1}
              onChange={setVolume}
              accent={accent}
              className="flex-1"
              ariaLabel="音量"
            />
          </div>
        </div>
      )}
    </div>
  )
}
