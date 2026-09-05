import React from 'react'

import type { LexicalProviderFactory } from '@/context/InklingCollaborationContext'

import { createLazyProviderFactory } from '@/utils/services/lazy-collaboration'

/**
 * The React adapter over the lazy-collaboration session
 * (src/utils/services/lazy-collaboration.ts): the provider factory for the
 * collaboration context — null while multiplayer is off or the chunk is
 * still loading (the caller serves the inert stub and keeps
 * CollaborationPlugin unmounted). The factory drops the moment multiplayer
 * is disabled — the adjust-state-during-render reset, not one effect tick
 * later — and a config change reloads the chunk without dropping the
 * already-loaded factory.
 */
export function useCollaborationProviderFactory({
  enabled,
  endpoint,
  docId,
  debug,
}: {
  enabled: boolean
  endpoint?: string
  docId?: string
  debug?: boolean
}): LexicalProviderFactory | null {
  const [session] = React.useState(() => createLazyProviderFactory())
  const [createWebsocketProvider, setCreateWebsocketProvider] = React.useState<LexicalProviderFactory | null>(null)

  // adjust state during render: drop the provider the moment multiplayer is
  // disabled, without waiting for the load effect
  const [prevEnabled, setPrevEnabled] = React.useState(enabled)
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled)
    if (!enabled) {
      setCreateWebsocketProvider(null)
    }
  }

  React.useEffect(() => {
    if (!enabled) {
      return
    }
    session.start((createFactory) => {
      setCreateWebsocketProvider(() => createFactory({ endpoint, docId, debug }))
    })
    return () => session.cancel()
  }, [enabled, endpoint, docId, debug, session])

  return createWebsocketProvider
}
