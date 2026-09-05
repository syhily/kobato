/**
 * The lazy collaboration chunk's load session (plan C5): the yjs/y-websocket
 * module loads on demand — the dynamic import runs inside an effect, never
 * during SSR, and only while multiplayer is enabled, so both published
 * entries stay free of yjs. Until the chunk resolves, the context serves
 * the inert factory and the CollaborationPlugin stays unmounted, so the
 * collab connection starts one async tick later than the eager build did
 * (the documented C5 tradeoff). This module owns the load's cancellation
 * matrix — supersede-on-restart and cancel-on-disable — behind the import
 * port, composed from the request-track guard (CONTEXT.md "request track"),
 * so the matrix is a synchronous test table. The React adapter is
 * `useCollaborationProviderFactory` (src/hooks).
 */

import type { LexicalProviderFactory } from '@/context/InklingCollaborationContext'

import { createRequestTrack } from '@/utils/services/request-track'

/** The lazy chunk's public shape — only the factory builder is consumed. */
export interface CollaborationChunk {
  createWebsocketProviderFactory: (config: {
    endpoint?: string
    docId?: string
    debug?: boolean
  }) => LexicalProviderFactory
}

/** The dynamic import — tests inject a scripted one. */
export type LoadCollaborationChunk = () => Promise<CollaborationChunk>

export interface LazyProviderFactorySession {
  /**
   * Kick the lazy load. `apply` receives the chunk's factory builder only
   * when this load is still the latest at resolve time — a superseded load
   * (restart with new config, disable, unmount) never applies. A rejected
   * import (network/chunk error) never applies either: the session stays
   * inert and the rejection is swallowed, never unhandled.
   */
  start: (apply: (createFactory: CollaborationChunk['createWebsocketProviderFactory']) => void) => void
  /** Supersede every in-flight load (disable, unmount, config change). */
  cancel: () => void
}

export function createLazyProviderFactory(
  load: LoadCollaborationChunk = () => import('@/utils/services/collaboration'),
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
        // A failed chunk import (network/chunk error) leaves the factory
        // inert — never an unhandled rejection.
        .catch(() => {})
    },
    cancel: () => track.dispose(),
  }
}
