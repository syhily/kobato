// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRumConsent, subscribeRumConsent, writeRumConsent } from '@/client/lib/rum-consent'

const STORAGE_KEY = 'kobato.rum.consent'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('readRumConsent', () => {
  it('returns null when nothing is stored', () => {
    expect(readRumConsent()).toBeNull()
  })

  it.each(['yes', 'true', '', 'ACCEPTED', 'accepted ', '{"accepted":true}'])(
    'returns null for a foreign stored value (%j)',
    (value) => {
      window.localStorage.setItem(STORAGE_KEY, value)
      expect(readRumConsent()).toBeNull()
    },
  )

  it('returns the persisted decision verbatim', () => {
    window.localStorage.setItem(STORAGE_KEY, 'accepted')
    expect(readRumConsent()).toBe('accepted')
    window.localStorage.setItem(STORAGE_KEY, 'declined')
    expect(readRumConsent()).toBe('declined')
  })
})

describe('writeRumConsent', () => {
  it('persists the decision so a later read returns it', () => {
    writeRumConsent('accepted')
    expect(readRumConsent()).toBe('accepted')
    writeRumConsent('declined')
    expect(readRumConsent()).toBe('declined')
  })
})

describe('subscribeRumConsent', () => {
  it('notifies same-tab subscribers on write (CustomEvent, not the storage event)', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRumConsent(listener)

    writeRumConsent('accepted')

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('notifies on a cross-tab storage event for the consent key only', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRumConsent(listener)

    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'x' }))
    expect(listener).not.toHaveBeenCalled()

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'declined' }))
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRumConsent(listener)
    unsubscribe()

    writeRumConsent('accepted')

    expect(listener).not.toHaveBeenCalled()
  })
})
