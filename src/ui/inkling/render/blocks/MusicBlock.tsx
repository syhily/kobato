import { use, type ReactNode } from 'react'

import type { InklingMusicCardNode } from '@/shared/inkling/schema'

import { MusicPlayer } from '@/ui/inkling/render/components/MusicPlayer'
import { InklingMusicMetaContext, InklingMusicPresentationContext } from '@/ui/inkling/render/render-shared'

export function MusicBlock({ node }: { node: InklingMusicCardNode }): ReactNode {
  const { suppressAutoplay } = use(InklingMusicPresentationContext)
  const musicMeta = use(InklingMusicMetaContext)
  // Prefer the meta embedded by `prerenderInklingMusicPlayers` (SSR), then
  // fall back to the React context map. The context path exists for callers
  // that pass musicMeta as a prop to <InklingBody>; the node.meta path is
  // the canonical SSR route (the post/page detail loaders enrich the body
  // before rendering).
  const meta = node.meta ?? musicMeta?.[node.playerId]
  return (
    <MusicPlayer
      id={node.playerId}
      meta={meta}
      auto={suppressAutoplay ? false : node.auto === true}
      alignment={node.center === true ? 'center' : 'start'}
    />
  )
}
