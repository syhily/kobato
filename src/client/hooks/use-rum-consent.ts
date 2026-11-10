// React half of the RUM identity-forwarding consent gate.
//
// Both reads go through `useSyncExternalStore`: the decision's server snapshot
// is `null` and `ready` is the hydration gate, so SSR and the first client
// render agree byte-for-byte and the consent banner never flashes for a
// visitor who already decided. `useRum` treats `null` as "not accepted", so
// the SDK chunk stays undownloaded until acceptance.

import { useCallback, useSyncExternalStore } from 'react'

import type { RumConsent } from '@/client/lib/rum-consent'

import { readRumConsent, subscribeRumConsent, writeRumConsent } from '@/client/lib/rum-consent'

export interface RumConsentState {
  /** False during SSR and the first client render; the banner renders only when true. */
  ready: boolean
  /** The visitor's decision; `null` while undecided (and on the server snapshot). */
  decision: RumConsent | null
  accept: () => void
  decline: () => void
}

const serverConsent = (): RumConsent | null => null

// No-op subscription — the snapshot flips on its own once hydration commits.
const emptySubscribe = () => () => undefined

export function useRumConsent(): RumConsentState {
  // Hydration gate, inlined: `@/client/` may not import `@/ui/` (the
  // boundaries contract), so the `useHydrated` idiom cannot be shared here.
  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
  const decision = useSyncExternalStore(subscribeRumConsent, readRumConsent, serverConsent)

  const accept = useCallback(() => {
    writeRumConsent('accepted')
  }, [])
  const decline = useCallback(() => {
    writeRumConsent('declined')
  }, [])

  return { ready, decision, accept, decline }
}
