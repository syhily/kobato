import { use, type ReactNode } from 'react'

import type { InklingMusicCardNode } from '@/shared/inkling/schema'

import { MusicPlayer } from '@/ui/inkling/render/components/MusicPlayer'
import { InklingMusicMetaContext, InklingMusicPresentationContext } from '@/ui/inkling/render/render-shared'

export function MusicBlock({ node }: { node: InklingMusicCardNode }): ReactNode {
  const { suppressAutoplay } = use(InklingMusicPresentationContext)
  const musicMeta = use(InklingMusicMetaContext)
  const meta = musicMeta?.[node.playerId]
  return (
    <MusicPlayer
      id={node.playerId}
      meta={meta}
      auto={suppressAutoplay ? false : node.auto === true}
      alignment={node.center === true ? 'center' : 'start'}
    />
  )
}
