import { type RefObject, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { MusicPlayerCardProps } from '@/ui/public/music-player/music-player'

// Music-player cards export a static mount point (`<div class="aplayer"
// data-url …>` wrapping a static fallback card); this hook upgrades every
// mount point with a URL to the real player after hydration. Mount points
// without `data-url` (missing music meta at save time) keep their placeholder
// — the PT-era behavior. The wrapper + mount-point markup comes from the
// shared card spec (`@/shared/lexical/cards/music-player`), and the fallback
// markup mirrors the player's paused initial render so the swap does not
// shift layout.
export function useMusicPlayers(containerRef: RefObject<HTMLElement | null>): void {
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
        const url = mount.getAttribute('data-url')
        if (url === null || url === '') {
          continue
        }
        const audio: MusicPlayerCardProps = {
          name: mount.getAttribute('data-name') ?? '',
          artist: mount.getAttribute('data-artist') ?? '',
          url,
          cover: mount.getAttribute('data-cover') || undefined,
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
  }, [containerRef])
}
