import { ChevronRightIcon, Music2Icon, XIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

import type { AudioInfo } from '@/ui/public/aplayer/types'

import { loadMusic } from '@/client/api/music'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

const APlayer = lazy(() => import('@/ui/public/aplayer/player').then((m) => ({ default: m.APlayer })))

export interface FloatingMusicPlayerTrack {
  /** Opaque player id (the one the public GET endpoint accepts). */
  playerId: string
  /** Display fallback shown while the metadata round-trip is in flight. */
  name: string
  artist: string[]
  /** Pre-resolved cover URL; used by the collapsed pill. */
  coverUrl: string
}

export interface FloatingMusicPlayerProps {
  track: FloatingMusicPlayerTrack
  onClose: () => void
}

export function FloatingMusicPlayer({ track, onClose }: FloatingMusicPlayerProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [audio, setAudio] = useState<AudioInfo | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const resolvedMeta = await loadMusic(track.playerId)
      if (cancelled) {
        return
      }
      if (resolvedMeta === null) {
        setLoadFailed(true)
        return
      }
      setAudio({
        name: resolvedMeta.name,
        artist: resolvedMeta.artist,
        url: resolvedMeta.url,
        cover: resolvedMeta.pic,
        lrc: resolvedMeta.lyric,
        theme: '#008c95',
      })
    })()

    return () => {
      cancelled = true
    }
    // Intentional: the parent passes a fresh `track` object every
    // mount via `key={track.playerId}`, so this hook only ever runs
    // once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Display preferences: prefer the resolved meta once it lands so
  // collapsed state matches what APlayer is actually playing, but
  // fall back to the row-derived hints during the initial fetch.
  const displayName = audio?.name ?? track.name
  const displayArtist =
    (typeof audio?.artist === 'string'
      ? audio?.artist
      : Array.isArray(audio?.artist)
        ? audio?.artist.join(' / ')
        : undefined) ?? track.artist.join(' / ')
  const displayCover = audio?.cover ?? track.coverUrl

  return (
    <section
      aria-label="浮动音乐播放器"
      className={cn(
        // Right-middle pin. `top-1/2 -translate-y-1/2` keeps the dock
        // vertically centred regardless of the player card height. The
        // z-index sits between the admin header (`z-30`) and the
        // scroll-to-top button (`z-40`) — same band as the back-to-top
        // affordance so neither steals focus from the other.
        'fixed top-1/2 right-4 z-40 -translate-y-1/2 transition-all duration-200 lg:right-6',
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`展开音乐播放器：${displayName}`}
        hidden={!collapsed}
        className={cn(
          'group flex items-center gap-2 rounded-full bg-card py-1.5 pr-3 pl-1.5 shadow-lg ring-1 ring-border',
          'text-sm text-foreground hover:ring-primary',
        )}
      >
        {displayCover !== '' ? (
          <img
            src={displayCover}
            alt=""
            className="size-8 shrink-0 animate-spin rounded-full object-cover"
            style={{ animationDuration: '6s' }}
            loading="lazy"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Music2Icon className="size-4 text-muted-foreground" />
          </span>
        )}
        <span className="flex max-w-32 flex-col text-left leading-tight">
          <span className="truncate text-xs font-medium">{displayName}</span>
          <span className="truncate text-(--text-micro) text-muted-foreground">{displayArtist}</span>
        </span>
        <ChevronRightIcon className="size-4 -rotate-180 text-muted-foreground transition-transform group-hover:text-primary" />
      </button>

      <div
        hidden={collapsed}
        className="w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-card shadow-xl ring-1 ring-border"
      >
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          <Music2Icon className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-xs font-medium text-muted-foreground">正在播放</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            aria-label="收起播放器"
            className="size-7"
          >
            <ChevronRightIcon data-icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="关闭并停止播放"
            className="size-7"
          >
            <XIcon data-icon />
          </Button>
        </div>
        <div className="bg-background">
          {loadFailed ? (
            <div className="flex items-center justify-center px-4 py-6 text-sm text-muted-foreground">
              加载失败，请刷新后再试。
            </div>
          ) : (
            <Suspense fallback={<div className="aplayer" data-id={track.playerId} />}>
              {audio ? (
                <APlayer audio={audio} autoPlay initialLoop="none" />
              ) : (
                <div className="aplayer" data-id={track.playerId} />
              )}
            </Suspense>
          )}
        </div>
      </div>
    </section>
  )
}
