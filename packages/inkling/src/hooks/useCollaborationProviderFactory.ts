import type { LexicalProviderFactory } from '@kobato/inkling-internal/context/InklingCollaborationContext'

import { createLazyProviderFactory } from '@kobato/inkling-internal/services/lazy-collaboration'
import { useEffect, useState } from 'react'
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
  const [session] = useState(() => createLazyProviderFactory())
  const [createWebsocketProvider, setCreateWebsocketProvider] = useState<LexicalProviderFactory | null>(null)

  const [prevEnabled, setPrevEnabled] = useState(enabled)
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled)
    if (!enabled) {
      setCreateWebsocketProvider(null)
    }
  }

  useEffect(() => {
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
