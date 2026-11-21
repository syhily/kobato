import type { RumConsent } from '@kobato/web-client/lib/rum/rum-consent'

import { readRumConsent, subscribeRumConsent, writeRumConsent } from '@kobato/web-client/lib/rum/rum-consent'
import { useCallback, useSyncExternalStore } from 'react'

export interface RumConsentState {
  ready: boolean
  decision: RumConsent | null
  accept: () => void
  decline: () => void
}

const serverConsent = (): RumConsent | null => null

const emptySubscribe = () => () => undefined

export function useRumConsent(): RumConsentState {
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
