import type { LexicalProviderFactory } from '@kobato/inkling-internal/context/InklingCollaborationContext'

import { requireMultiplayerConfig } from '@kobato/inkling-internal/services/multiplayer-config'
import { WebsocketProvider } from 'y-websocket'
import { Doc } from 'yjs'

type ProviderEventCallbacks = {
  sync: (isSynced: boolean) => void
  update: (arg0: unknown) => void
  status: (arg0: { status: string }) => void
  reload: (doc: Doc) => void
}

type ProviderAwareness = ReturnType<LexicalProviderFactory>['awareness']

const PROVIDER_AWARENESS_MEMBERS = [
  'getLocalState',
  'getStates',
  'off',
  'on',
  'setLocalState',
  'setLocalStateField',
] as const

function isProviderAwareness(value: unknown): value is ProviderAwareness {
  return typeof value === 'object' && value !== null && PROVIDER_AWARENESS_MEMBERS.every((member) => member in value)
}

function requireProviderAwareness(value: unknown): ProviderAwareness {
  if (!isProviderAwareness(value)) {
    throw new TypeError('adaptWebsocketProvider: provider.awareness does not implement ProviderAwareness')
  }
  return value
}

export function adaptWebsocketProvider(provider: WebsocketProvider): ReturnType<LexicalProviderFactory> {
  const listeners: { [K in keyof ProviderEventCallbacks]: Set<ProviderEventCallbacks[K]> } = {
    sync: new Set(),
    update: new Set(),
    status: new Set(),
    reload: new Set(),
  }
  provider.on('sync', (isSynced) => listeners.sync.forEach((callback) => callback(isSynced)))
  provider.on('status', (event) => listeners.status.forEach((callback) => callback(event)))

  function on<K extends keyof ProviderEventCallbacks>(type: K, callback: ProviderEventCallbacks[K]): void {
    listeners[type].add(callback)
  }

  function off<K extends keyof ProviderEventCallbacks>(type: K, callback: ProviderEventCallbacks[K]): void {
    listeners[type].delete(callback)
  }

  return {
    awareness: requireProviderAwareness(provider.awareness),
    connect: () => provider.connect(),
    disconnect: () => provider.disconnect(),
    on,
    off,
  }
}

export interface WebsocketProviderFactoryConfig {
  endpoint?: string
  docId?: string
  debug?: boolean
}

export function createWebsocketProviderFactory({
  endpoint,
  docId,
  debug,
}: WebsocketProviderFactoryConfig): LexicalProviderFactory {
  return (id, yjsDocMap) => {
    const config = requireMultiplayerConfig(endpoint, docId)
    let doc = yjsDocMap.get(id)

    if (doc === undefined) {
      doc = new Doc()
      yjsDocMap.set(id, doc)
    } else {
      doc.load()
    }

    const provider = new WebsocketProvider(config.multiplayerEndpoint, config.multiplayerDocId + '/' + id, doc, {
      connect: false,
    })

    if (debug) {
      provider.on('status', (event) => {
        console.warn(event.status, `id: ${config.multiplayerDocId}/${id}`)
      })
    }

    return adaptWebsocketProvider(provider)
  }
}
