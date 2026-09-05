import type { WebsocketProvider } from 'y-websocket'

import { describe, expect, it, vi } from 'vitest'
import { Doc } from 'yjs'

import { adaptWebsocketProvider, createWebsocketProviderFactory } from '@/utils/services/collaboration'

type FakeProvider = {
  awareness: { fakeAwareness: true }
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  on: (type: string, callback: (event: unknown) => void) => void
  emit: (type: string, event: unknown) => void
}

function createFakeWebsocketProvider(): FakeProvider {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  return {
    awareness: { fakeAwareness: true },
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: (type, callback) => {
      const listeners = handlers.get(type) ?? new Set()
      listeners.add(callback)
      handlers.set(type, listeners)
    },
    emit: (type, event) => {
      handlers.get(type)?.forEach((callback) => callback(event))
    },
  }
}

function adaptFake(fake: FakeProvider) {
  return adaptWebsocketProvider(fake as unknown as WebsocketProvider)
}

describe('adaptWebsocketProvider', function () {
  it('forwards sync events to registered sync handlers', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    const onSync = vi.fn()
    adapted.on('sync', onSync)
    fake.emit('sync', true)

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenCalledWith(true)
  })

  it('forwards status events to registered status handlers', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    const onStatus = vi.fn()
    adapted.on('status', onStatus)
    fake.emit('status', { status: 'connected' })

    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith({ status: 'connected' })
  })

  it('stops forwarding once the handler is removed with off', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    const onSync = vi.fn()
    adapted.on('sync', onSync)
    adapted.off('sync', onSync)
    fake.emit('sync', true)

    expect(onSync).not.toHaveBeenCalled()
  })

  it('never fires update or reload handlers', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    // y-websocket only ever emits sync/status; the adapter multiplexes those
    // two, so handlers for the remaining Lexical channels stay dead even if
    // the provider itself emitted on them
    const onUpdate = vi.fn()
    const onReload = vi.fn()
    adapted.on('update', onUpdate)
    adapted.on('reload', onReload)

    fake.emit('sync', true)
    fake.emit('status', { status: 'connected' })
    fake.emit('update', new Uint8Array())
    fake.emit('reload', new Doc())

    expect(onUpdate).not.toHaveBeenCalled()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('passes the provider awareness through untouched', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    expect(adapted.awareness).toBe(fake.awareness)
  })

  it('delegates connect and disconnect to the provider', function () {
    const fake = createFakeWebsocketProvider()
    const adapted = adaptFake(fake)

    void adapted.connect()
    adapted.disconnect()

    expect(fake.connect).toHaveBeenCalledTimes(1)
    expect(fake.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('createWebsocketProviderFactory', function () {
  it.each([[{ endpoint: 'ws://localhost:1234' }], [{ docId: 'doc' }], [{}]])(
    'rejects incomplete multiplayer config when the factory is invoked, not when it is created',
    function (config) {
      const factory = createWebsocketProviderFactory(config)

      expect(() => factory('card-1', new Map())).toThrow(
        '<InklingComposer> enableMultiplayer requires both multiplayerEndpoint and multiplayerDocId',
      )
    },
  )

  it('creates a shared doc in the doc map on first use and reloads it on reuse', function () {
    const factory = createWebsocketProviderFactory({ endpoint: 'ws://localhost:1234', docId: 'doc' })
    const docMap = new Map<string, Doc>()

    const first = factory('card-1', docMap)
    const doc = docMap.get('card-1')
    expect(doc).toBeInstanceOf(Doc)

    const loadSpy = vi.spyOn(doc!, 'load')
    const second = factory('card-1', docMap)

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(docMap.get('card-1')).toBe(doc)

    first.disconnect()
    second.disconnect()
  })

  it('returns providers exposing the surface Lexical requires', function () {
    const factory = createWebsocketProviderFactory({ endpoint: 'ws://localhost:1234', docId: 'doc', debug: false })

    const provider = factory('card-1', new Map())

    expect(provider.awareness).toBeDefined()
    expect(typeof provider.connect).toBe('function')
    expect(typeof provider.disconnect).toBe('function')
    expect(typeof provider.on).toBe('function')
    expect(typeof provider.off).toBe('function')

    provider.disconnect()
  })
})
