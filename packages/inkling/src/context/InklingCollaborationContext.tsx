import type { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'

import React from 'react'

// Derived from the installed component — Lexical's own ProviderFactory alias
// is unexported.
export type LexicalProviderFactory = React.ComponentProps<typeof CollaborationPlugin>['providerFactory']

export interface InklingCollaborationContextValue {
  createWebsocketProvider: LexicalProviderFactory
}

export const noopWebsocketProviderFactory: LexicalProviderFactory = () => ({
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    off: () => undefined,
    on: () => undefined,
    setLocalState: () => undefined,
    setLocalStateField: () => undefined,
  },
  connect: () => undefined,
  disconnect: () => undefined,
  off: () => undefined,
  on: () => undefined,
})

const InklingCollaborationContext = React.createContext<InklingCollaborationContextValue>({
  createWebsocketProvider: noopWebsocketProviderFactory,
})

export default InklingCollaborationContext
