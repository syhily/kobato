export type RumConsent = 'accepted' | 'declined'

const STORAGE_KEY = 'kobato.rum.consent'
const CONSENT_EVENT = 'kobato:rum-consent'

export function readRumConsent(): RumConsent | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch {
    return null
  }
}

export function writeRumConsent(consent: RumConsent): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, consent)
  } catch {}
  try {
    globalThis.dispatchEvent(new CustomEvent(CONSENT_EVENT))
  } catch {}
}

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
