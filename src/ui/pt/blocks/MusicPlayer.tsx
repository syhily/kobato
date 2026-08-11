import { lazy, Suspense } from 'react'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'
import type { AudioInfo } from '@/ui/public/aplayer/types'

import { cn } from '@/ui/lib/cn'
import { useHydrated } from '@/ui/lib/use-hydrated'

const APlayer = lazy(() => import('@/ui/public/aplayer/player').then((m) => ({ default: m.APlayer })))

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

export function MusicPlayer({ meta, id, auto, alignment }: MusicPlayerProps) {
  // Hydration gate: SSR and the hydrating client both render the placeholder,
  // so the lazy APlayer boundary below only mounts after the first client
  // commit — its non-identical fallback can never mismatch streamed markup
  // (React error #418).
  const hydrated = useHydrated()
  const wrapperClass = cn(
    'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full',
    alignment === 'center' && 'mx-auto max-md:mx-auto',
  )

  if (meta === undefined) {
    return (
      <div className={wrapperClass}>
        <div className="aplayer" data-id={id} />
      </div>
    )
  }

  const audio = toAudioInfo(meta)
  const placeholder = <div className="aplayer" data-id={meta.id} />

  return (
    <div className={wrapperClass}>
      {hydrated ? (
        <Suspense fallback={placeholder}>
          <APlayer audio={audio} autoPlay={auto ?? false} />
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  )
}
