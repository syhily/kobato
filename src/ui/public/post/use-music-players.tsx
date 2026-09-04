import { type RefObject, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { AudioInfo } from '@/ui/public/aplayer/types'

// Music-player cards export a static mount point (`<div class="aplayer"
// data-url …>` wrapping a static fallback card); this hook upgrades every
// mount point with a URL to the real player after hydration. Mount points
// without `data-url` (missing music meta at save time) keep their placeholder
// — the PT-era behavior. The wrapper + mount-point markup comes from the
// shared card spec (`@/shared/lexical/cards/music-player`).
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

    void import('@/ui/public/aplayer/player').then(({ APlayer }) => {
      if (cancelled) {
        return
      }
      for (const mount of mounts) {
        const url = mount.getAttribute('data-url')
        if (url === null || url === '') {
          continue
        }
        const audio: AudioInfo = {
          name: mount.getAttribute('data-name') ?? undefined,
          artist: mount.getAttribute('data-artist') ?? undefined,
          url,
          cover: mount.getAttribute('data-cover') ?? undefined,
          lrc: mount.getAttribute('data-lrc') ?? undefined,
          theme: '#007a82',
        }
        // Drop the static fallback card before React takes over the node.
        mount.replaceChildren()
        const root = createRoot(mount)
        root.render(<APlayer audio={audio} autoPlay={false} />)
        roots.push(root)
      }
    })

    return () => {
      cancelled = true
      for (const root of roots) {
        root.unmount()
      }
    }
  }, [containerRef])
}
