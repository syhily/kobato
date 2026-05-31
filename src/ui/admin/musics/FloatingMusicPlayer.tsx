import { ChevronRightIcon, Music2Icon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { PublicMusicMeta as MusicMeta } from '@/shared/types/music'

import { loadMusic } from '@/client/api/music'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

// Floating, single-instance APlayer dock for the music admin page.
//
// Behaviour summary:
//   - `track === null` keeps the dock unmounted (no APlayer payload
//     loaded and no fixed element on screen).
//   - When the operator clicks 「播放」 in the music table, the parent
//     remounts this component with the new track. We REMOUNT (via the
//     React `key` on the call site) instead of re-using the same
//     APlayer instance because aplayer-ts mutates the container DOM
//     extensively and supports a re-init cycle (see `MusicPlayer.tsx`)
//     more cleanly than `switchAudio`-style mutation.
//   - The dock has two visual states: expanded (full APlayer card,
//     ~340px wide) and collapsed (slim pill on the right edge, only
//     showing the cover + a chevron). Closing destroys the APlayer
//     instance via `onClose`.
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [meta, setMeta] = useState<MusicMeta | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let destroy: (() => void) | undefined

    // Lazy-load aplayer-ts so the audio decoder and its CSS do not bloat
    // the admin music-list chunk. The dock only mounts after the operator
    // explicitly hits 「播放」.
    void (async () => {
      const [{ default: APlayer }, resolvedMeta] = await Promise.all([
        import('aplayer-ts'),
        loadMusic(track.playerId),
        import('aplayer-ts/src/css/base.css'),
      ])
      if (cancelled) {
        return
      }
      if (resolvedMeta === null) {
        setLoadFailed(true)
        return
      }
      setMeta(resolvedMeta)

      // Defer one frame so the container is in the DOM and laid out.
      // The expanded card is always mounted (collapse only toggles
      // `hidden`), but APlayer reads element size during init so
      // waiting for the first paint avoids a zero-size measurement.
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const container = containerRef.current
      if (cancelled || container === null) {
        return
      }

      const player = APlayer().init({
        container,
        lrcType: 1,
        loop: 'none',
        autoplay: true,
        audio: {
          name: resolvedMeta.name,
          artist: resolvedMeta.artist,
          url: resolvedMeta.url,
          cover: resolvedMeta.pic,
          theme: '#008c95',
          lrc: resolvedMeta.lyric,
        },
      })

      destroy = () => {
        try {
          player.destroy()
          container.innerHTML = ''
        } catch {
          // Already torn down; nothing actionable.
        }
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
    }
    // Intentional: the parent passes a fresh `track` object every
    // mount via `key={track.playerId}`, so this hook only ever runs
    // once per mount. Re-binding on shallow `track` mutations would
    // tear down APlayer mid-playback for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Display preferences: prefer the resolved meta once it lands so
  // collapsed state matches what APlayer is actually playing, but
  // fall back to the row-derived hints during the initial fetch.
  const displayName = meta?.name ?? track.name
  const displayArtist = meta?.artist ?? track.artist.join(' / ')
  const displayCover = meta?.pic ?? track.coverUrl

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
      {/*
       * IMPORTANT: keep both states mounted at all times and toggle
       * visibility through `hidden`. Conditionally rendering one
       * subtree or the other tears down the `<div ref={containerRef}>`
       * that hosts the APlayer instance, and the init effect runs
       * exactly once per mount — so a collapse-then-expand cycle
       * would surface an empty card. Audio under a `hidden` ancestor
       * keeps playing, so collapsing/expanding is now lossless.
       */}
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
            // APlayer mounts inside this div; its internal stylesheet
            // (lazy-loaded above) handles the visual layout. We don't
            // need an explicit min-height — APlayer renders its own
            // chrome on init.
            <div ref={containerRef} className="aplayer" data-id={track.playerId} />
          )}
        </div>
      </div>
    </section>
  )
}
