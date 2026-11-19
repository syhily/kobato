/**
 * The lazy collaboration chunk's load session: the yjs/y-websocket module loads on demand
 * (dynamic import inside an effect, never during SSR, only while multiplayer is enabled),
 * so both published entries stay free of yjs; until it resolves, the context serves the
 * inert factory. This module owns the load's cancellation matrix — supersede-on-restart and
 * cancel-on-disable — behind the import port; the React adapter is
 * `useCollaborationProviderFactory`.
 */

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
        // A failed chunk import (network/chunk error) leaves the factory inert — never an unhandled rejection.
        .catch(() => {
          /* noop */
        })
    },
    cancel: () => track.dispose(),
  }
}
