import { WebsocketProvider } from 'y-websocket'
import { Doc } from 'yjs'

import type { LexicalProviderFactory } from '@/context/InklingCollaborationContext'

import { requireMultiplayerConfig } from './multiplayer-config'

// The events Lexical's Provider interface registers handlers for. Of these,
// y-websocket's WebsocketProvider only ever emits 'sync' and 'status' — its
// typed event map doesn't even admit 'update' or 'reload' — so adapt by
// multiplexing: handlers register in a local map and the two events the
// provider really emits are forwarded into it. 'update'/'reload' handlers
// never fire, exactly as when they were registered on the provider directly.
type ProviderEventCallbacks = {
  sync: (isSynced: boolean) => void
  update: (arg0: unknown) => void
  status: (arg0: { status: string }) => void
  reload: (doc: Doc) => void
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
    // y-protocols' Awareness and Lexical's ProviderAwareness describe the same
    // runtime object, but TS 6 won't reconcile them: Awareness declares its
    // state maps with `any`-valued index signatures while UserState has
    // required named fields (anchorPos/color/...), and index signatures no
    // longer satisfy required properties, so not even a single-step assertion
    // is accepted. The plugin populates and reads the state itself through
    // setLocalState/setLocalStateField; the assertion is confined to this one
    // member — every other member of the adapter is structural.
    awareness: provider.awareness as unknown as ReturnType<LexicalProviderFactory>['awareness'],
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

// The provider factory Lexical's CollaborationPlugin expects: one shared Doc
// per id in the doc map (created on first use, reloaded when reused), a
// room-scoped WebsocketProvider that stays disconnected until the plugin
// connects it, and optional status logging.
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
