import { lazy, Suspense, useEffect, useState } from 'react'

import type { AudioInfo } from '@/ui/public/aplayer/types'

import { loadMusic } from '@/client/api/music'
import { cn } from '@/ui/lib/cn'

const APlayer = lazy(() => import('@/ui/public/aplayer/player').then((m) => ({ default: m.APlayer })))

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

export function MusicPlayer({ id, auto, alignment: center }: MusicPlayerProps) {
  const [audio, setAudio] = useState<AudioInfo | null>(null)

  useEffect(() => {
    if (!id) {
      return
    }
    let cancelled = false

    void (async () => {
      const meta = await loadMusic(id)
      if (cancelled || meta === null) {
        return
      }
      setAudio({
        name: meta.name,
        artist: meta.artist,
        url: meta.url,
        cover: meta.pic,
        lrc: meta.lyric,
        theme: '#008c95',
      })
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div
      className={cn(
        'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full',
        center && 'mx-auto max-md:mx-auto',
      )}
    >
      <Suspense fallback={<div className="aplayer" data-id={id} />}>
        {audio ? <APlayer audio={audio} autoPlay={auto ?? false} /> : null}
      </Suspense>
    </div>
  )
}
