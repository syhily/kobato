// Visitor privacy consent for RUM request-identity forwarding: only meaningful
// with `observability.frontend.clientIdentity: forward`, where the relay
// attaches the visitor's address and User-Agent — so the strict gate starts NO
// collection (not even the SDK download) until the visitor explicitly accepts.
// The decision persists in localStorage; `declined` is permanent until site
// data is cleared (the banner never asks again). Blocked/missing storage
// degrades to "no decision" (the gate stays closed).
//
// Same-tab updates ride a CustomEvent (the `storage` event only fires in
// OTHER documents).

export type RumConsent = 'accepted' | 'declined'

const STORAGE_KEY = 'kobato.rum.consent'
const CONSENT_EVENT = 'kobato:rum-consent'

/** The persisted decision, or `null` when unset/unreadable/foreign. */
export function readRumConsent(): RumConsent | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch {
    return null
  }
}

/** Persist the decision and notify every subscriber in this document. */
export function writeRumConsent(consent: RumConsent): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, consent)
  } catch {
    // Storage blocked: the in-page event still settles this document.
  }
  try {
    globalThis.dispatchEvent(new CustomEvent(CONSENT_EVENT))
  } catch {
    // A non-DOM host (tests) simply skips the notification.
  }
}

/** Subscribe to decision changes in this tab (CustomEvent) and others (`storage`). */
export function subscribeRumConsent(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      listener()
    }
  }
  globalThis.addEventListener(CONSENT_EVENT, listener)
  globalThis.addEventListener('storage', onStorage)
  return () => {
    globalThis.removeEventListener(CONSENT_EVENT, listener)
    globalThis.removeEventListener('storage', onStorage)
  }
}
