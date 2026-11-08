// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocaleChangeAnnouncement } from '@/client/lib/locale-sync'

import { FakeBroadcastChannel } from '#/_helpers/fake-broadcast-channel'
import {
  SETTINGS_LOCALE_CHANNEL,
  createLocaleSyncOrigin,
  publishLocaleChange,
  subscribeLocaleChange,
} from '@/client/lib/locale-sync'

// `FakeBroadcastChannel` delivers synchronously to every OTHER channel with the
// same name, mirroring the one property the design leans on: a posting object
// never receives its own message, but another channel in the same realm does.

function collect() {
  const received: LocaleChangeAnnouncement[] = []
  const unsubscribe = subscribeLocaleChange('listener', (announcement) => received.push(announcement))
  return { received, unsubscribe }
}

beforeEach(() => {
  FakeBroadcastChannel.instances.length = 0
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
  FakeBroadcastChannel.instances.length = 0
})

describe('client/lib/locale-sync', () => {
  it('delivers a peer announcement to another document', () => {
    const { received, unsubscribe } = collect()

    publishLocaleChange('en-US', createLocaleSyncOrigin())

    expect(received).toEqual([{ locale: 'en-US' }])
    expect(FakeBroadcastChannel.instances[0]!.name).toBe(SETTINGS_LOCALE_CHANNEL)
    unsubscribe()
  })

  it('carries the sender’s settings revision as the dedupe token', () => {
    const { received, unsubscribe } = collect()

    publishLocaleChange('zh-TW', createLocaleSyncOrigin(), 'boot-1:0000000003')

    expect(received).toEqual([{ locale: 'zh-TW', revision: 'boot-1:0000000003' }])
    unsubscribe()
  })

  it('ignores a malformed revision instead of forwarding it', () => {
    const { received, unsubscribe } = collect()
    const peer = new FakeBroadcastChannel(SETTINGS_LOCALE_CHANNEL)

    peer.postMessage({ kind: 'settings.locale-changed', locale: 'en-US', source: 'peer', revision: 7 })

    expect(received).toEqual([{ locale: 'en-US' }])
    unsubscribe()
    peer.close()
  })

  it('never delivers a publisher its own echo (the channel loops back in-document)', () => {
    const origin = createLocaleSyncOrigin()
    const received: LocaleChangeAnnouncement[] = []
    const unsubscribe = subscribeLocaleChange(origin, (announcement) => received.push(announcement))

    publishLocaleChange('en-US', origin)

    expect(received).toEqual([])
    unsubscribe()
  })

  it('ignores unknown kinds, unsupported locales and messages without an origin', () => {
    const { received, unsubscribe } = collect()
    const peer = new FakeBroadcastChannel(SETTINGS_LOCALE_CHANNEL)

    peer.postMessage({ kind: 'something-else', locale: 'en-US', source: 'peer' })
    peer.postMessage({ kind: 'settings.locale-changed', locale: 'fr-FR', source: 'peer' })
    peer.postMessage({ kind: 'settings.locale-changed', locale: 'en-US' })
    peer.postMessage(null)
    peer.postMessage('en-US')

    expect(received).toEqual([])
    unsubscribe()
    peer.close()
  })

  it('stops delivering after unsubscribe', () => {
    const { received, unsubscribe } = collect()
    unsubscribe()

    publishLocaleChange('zh-TW', createLocaleSyncOrigin())

    expect(received).toEqual([])
  })

  it('degrades to a no-op when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { received, unsubscribe } = collect()

    expect(() => publishLocaleChange('en-US', createLocaleSyncOrigin())).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()
    expect(received).toEqual([])
  })

  it('survives a constructor that throws (sandboxed iframe policy)', () => {
    class ThrowingBroadcastChannel {
      constructor() {
        throw new Error('blocked')
      }
    }
    vi.stubGlobal('BroadcastChannel', ThrowingBroadcastChannel)
    const { received, unsubscribe } = collect()

    expect(() => publishLocaleChange('en-US', createLocaleSyncOrigin())).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()
    expect(received).toEqual([])
  })

  it('hands each document its own origin id', () => {
    const first = createLocaleSyncOrigin()
    const second = createLocaleSyncOrigin()
    expect(first).not.toBe('')
    expect(first).not.toBe(second)
  })
})
