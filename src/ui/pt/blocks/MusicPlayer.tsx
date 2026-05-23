import { useEffect, useRef } from 'react'

import { loadMusic } from '@/client/api/music'
import { cn } from '@/ui/lib/cn'

export interface MusicPlayerProps {
  id: string
  auto?: boolean
  alignment?: 'center' | 'start'
}

const MUSIC_PLAYER_IDLE_TIMEOUT_MS = 2_000

export interface MusicPlayerInitHost {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  setTimeout: (callback: () => void, timeout?: number) => number
  clearTimeout: (handle: number) => void
}

function getMusicPlayerInitHost(): MusicPlayerInitHost | undefined {
  return typeof window === 'undefined' ? undefined : window
}

export function scheduleMusicPlayerInit(
  task: () => void,
  host: MusicPlayerInitHost | undefined = getMusicPlayerInitHost(),
): () => void {
  if (host === undefined) {
    return () => undefined
  }

  let cancelled = false
  const run = () => {
    if (cancelled) {
      return
    }
    cancelled = true
    task()
  }

  if (host.requestIdleCallback !== undefined) {
    const id = host.requestIdleCallback(run, { timeout: MUSIC_PLAYER_IDLE_TIMEOUT_MS })
    return () => {
      cancelled = true
      host.cancelIdleCallback?.(id)
    }
  }

  if (host.requestAnimationFrame !== undefined) {
    let timeoutId: number | undefined
    const frameId = host.requestAnimationFrame(() => {
      if (cancelled) {
        return
      }
      timeoutId = host.setTimeout(run, 0)
    })
    return () => {
      cancelled = true
      host.cancelAnimationFrame?.(frameId)
      if (timeoutId !== undefined) {
        host.clearTimeout(timeoutId)
      }
    }
  }

  const timeoutId = host.setTimeout(run, 0)
  return () => {
    cancelled = true
    host.clearTimeout(timeoutId)
  }
}

// MDX-embeddable music player. Lazy-loads APlayer only when the
// component is actually mounted, so posts without music carry no
// aplayer.js payload.
//
// Metadata is fetched through the internal public API
// (`/api/music/get?id=<playerId>`) which resolves the audio /
// cover URL pair against the configured S3 public base URL on the
// server side. The client never has to know about asset hosts or
// storage settings.
//
// **Autoplay scheduling**: `scheduleMusicPlayerInit` defers onto
// `requestIdleCallback` (with a timeout), which can land hundreds of ms
// to seconds after navigation. Chromium treats audibly starting media
// that late as unrelated to user activation and blocks `audio.play()`
// even though APlayer passes `autoplay: true`. When `auto` is set we
// therefore skip idle deferral entirely and initialise on the earliest
// async turn (still one animation frame wait for DOM layout — same idea
// as `FloatingMusicPlayer`).
export function MusicPlayer({ id, auto, alignment: center }: MusicPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) {
      return
    }
    let cancelled = false
    let destroy: (() => void) | undefined

    const waitForPaint = (): Promise<void> =>
      new Promise((resolve) => {
        const host = typeof window !== 'undefined' ? window : undefined
        if (host?.requestAnimationFrame !== undefined) {
          host.requestAnimationFrame(() => resolve())
          return
        }
        resolve()
      })

    // Lazy-load aplayer-ts so the decoder + DOM-heavy CSS stay out of the
    // initial page chunk. The player is only needed when the article
    // actually contains a `<MusicPlayer>` block, which is a minority of posts.
    const bootstrap = (): void => {
      if (cancelled) {
        return
      }
      void (async () => {
        const [{ default: APlayer }, meta] = await Promise.all([
          import('aplayer-ts'),
          loadMusic(id),
          import('aplayer-ts/src/css/base.css'),
        ])
        if (cancelled || meta === null) {
          return
        }

        await waitForPaint()
        const container = containerRef.current
        if (cancelled || container === null) {
          return
        }

        const player = APlayer().init({
          container,
          lrcType: 1,
          loop: 'none',
          autoplay: auto ?? false,
          audio: {
            name: meta.name,
            artist: meta.artist,
            url: meta.url,
            cover: meta.pic,
            theme: '#008c95',
            lrc: meta.lyric,
          },
        })

        destroy = () => {
          try {
            player.destroy()
            container.innerHTML = ''
          } catch {
            // Nothing actionable: we're already tearing down.
          }
        }
      })()
    }

    let cancelScheduled: (() => void) | undefined
    if (auto === true) {
      bootstrap()
    } else {
      cancelScheduled = scheduleMusicPlayerInit(bootstrap)
    }

    return () => {
      cancelled = true
      cancelScheduled?.()
      destroy?.()
    }
  }, [id, auto])

  return (
    <div
      className={cn(
        'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full',
        center && 'mx-auto max-md:mx-auto',
      )}
    >
      <div ref={containerRef} className="aplayer" data-id={id} />
    </div>
  )
}
