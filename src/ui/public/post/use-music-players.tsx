import { type RefObject, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { MusicPlayerCardProps } from '@/ui/public/music-player/music-player'

import { isHttpUrl } from '@/shared/utils/safe-url'

// Defense-in-depth for the hydrated mount points: `data-url` / `data-cover`
// are sanitized with the `body` preset before they land in the projected
// body_html, but this hook assigns them to `audio.src` / `<img src>` directly.
// Accept only http(s) URLs and same-origin relative paths (`/…`, never `//host`)
// — `javascript:`, `data:`, and protocol-relative values skip the card and leave
// its static fallback in place.
export function safeMediaSrc(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') ? undefined : trimmed
  }
  return isHttpUrl(trimmed) ? trimmed : undefined
}

// Music-player cards export a static mount point (`<div class="aplayer"
// data-url …>` wrapping a static fallback card); this hook upgrades every
// mount point with a URL to the real player after hydration. Mount points
// without `data-url` (missing music meta at save time) keep their placeholder
// — the PT-era behavior. The wrapper + mount-point markup comes from the
// shared card spec (`@/shared/lexical/cards/music-player`), and the fallback
// markup mirrors the player's paused initial render so the swap does not
// shift layout.
//
// `bodyHtml` is the effect's re-scan key: the container div is REUSED across
// client-side navigations (only its innerHTML is swapped), so without it the
// effect would never re-run — the previous article's React roots would keep
// playing audio on detached nodes and the new article's mount points would
// stay static fallbacks. The cleanup unmounts those roots, and the playback
// hook's own teardown pauses the audio element.
export function useMusicPlayers(containerRef: RefObject<HTMLElement | null>, bodyHtml: string): void {
  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const mounts = container.querySelectorAll('.aplayer[data-url]')
    if (mounts.length === 0) {
      return
    }

    let cancelled = false
    const roots: Root[] = []

    void import('@/ui/public/music-player/music-player').then(({ MusicPlayerCard }) => {
      if (cancelled) {
        return
      }
      for (const mount of mounts) {
        const url = safeMediaSrc(mount.getAttribute('data-url'))
        if (url === undefined) {
          continue
        }
        const audio: MusicPlayerCardProps = {
          name: mount.getAttribute('data-name') ?? '',
          artist: mount.getAttribute('data-artist') ?? '',
          url,
          cover: safeMediaSrc(mount.getAttribute('data-cover')),
          lrc: mount.getAttribute('data-lrc') || undefined,
        }
        // Drop the static fallback card before React takes over the node.
        mount.replaceChildren()
        const root = createRoot(mount)
        root.render(<MusicPlayerCard {...audio} />)
        roots.push(root)
      }
    })

    return () => {
      cancelled = true
      // root.unmount() tears the tree down synchronously; if React is
      // mid-render when this cleanup runs (the container re-rendering under
      // it), that races the in-flight render — React warns and may drop the
      // unmount. Deferring past the current commit avoids the race.
      setTimeout(() => {
        for (const root of roots) {
          root.unmount()
        }
      })
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- bodyHtml is the deliberate re-scan key: navigation swaps the reused container's innerHTML
  }, [containerRef, bodyHtml])
}
