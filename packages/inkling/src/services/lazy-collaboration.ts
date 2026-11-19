import type { LexicalProviderFactory } from '@kobato/inkling-internal/context/InklingCollaborationContext'

import { createRequestTrack } from '@kobato/inkling-internal/services/request-track'

export interface CollaborationChunk {
  createWebsocketProviderFactory: (config: {
    endpoint?: string
    docId?: string
    debug?: boolean
  }) => LexicalProviderFactory
}

export type LoadCollaborationChunk = () => Promise<CollaborationChunk>

export interface LazyProviderFactorySession {
  start: (apply: (createFactory: CollaborationChunk['createWebsocketProviderFactory']) => void) => void
  cancel: () => void
}
export function createLazyProviderFactory(
  load: LoadCollaborationChunk = () => import('@kobato/inkling-internal/services/collaboration'),
): LazyProviderFactorySession {
  const track = createRequestTrack()
  return {
    start(apply) {
      const generation = track.next()
      void load()
        .then(({ createWebsocketProviderFactory }) => {
          if (track.isLatest(generation)) {
            apply(createWebsocketProviderFactory)
          }
        })
        .catch(() => undefined)
    },
    cancel: () => track.dispose(),
  }
}
