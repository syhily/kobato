import type { AudioInfo } from '@kobato/editor/engine/aplayer/types'
import type { MusicPlayerBlockMeta } from '@kobato/shared/types/music'

import { cn } from '@kobato/editor/engine/lib/cn'
import { lazy, Suspense } from 'react'

const APlayer = lazy(() => import('@kobato/editor/engine/aplayer/player').then((m) => ({ default: m.APlayer })))

export interface MusicPlayerProps {
  /** Resolved metadata from SSR. When provided the player renders immediately. */
  meta?: MusicPlayerBlockMeta
  /** Legacy player id used as a fallback placeholder in contexts without SSR meta. */
  id?: string
  auto?: boolean
  alignment?: 'center' | 'start'
}

function toAudioInfo(meta: MusicPlayerBlockMeta): AudioInfo {
  return {
    name: meta.name,
    artist: meta.artist,
    url: meta.audioUrl,
    cover: meta.cover,
    lrc: meta.lyric,
    theme: '#007a82',
  }
}

export function MusicPlayer({ meta, id, auto, alignment: center }: MusicPlayerProps) {
  const wrapperClass = cn(
    'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full',
    center && 'mx-auto max-md:mx-auto',
  )

  if (meta === undefined) {
    return (
      <div className={wrapperClass}>
        <div className="aplayer" data-id={id} />
      </div>
    )
  }

  const audio = toAudioInfo(meta)

  return (
    <div className={wrapperClass}>
      <Suspense fallback={<div className="aplayer" data-id={meta.id} />}>
        <APlayer audio={audio} autoPlay={auto ?? false} />
      </Suspense>
    </div>
  )
}
