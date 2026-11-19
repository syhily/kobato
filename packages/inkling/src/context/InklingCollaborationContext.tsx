import type { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'

import React from 'react'

// Derived from the installed component — Lexical's own ProviderFactory alias
// is unexported.
export type LexicalProviderFactory = React.ComponentProps<typeof CollaborationPlugin>['providerFactory']

export interface InklingCollaborationContextValue {
  createWebsocketProvider: LexicalProviderFactory
}

// Inert stand-in while multiplayer is off and while the lazy collaboration
// chunk is still loading. CollaborationPlugin mounts only once the real
// factory arrives, so this stub is never asked to connect.
export const noopWebsocketProviderFactory: LexicalProviderFactory = () => ({
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    off: () => {
      /* noop */
    },
    on: () => {
      /* noop */
    },
    setLocalState: () => {
      /* noop */
    },
    setLocalStateField: () => {
      /* noop */
    },
  },
  connect: () => {
    /* noop */
  },
  disconnect: () => {
    /* noop */
  },
  off: () => {
    /* noop */
  },
  on: () => {
    /* noop */
  },
})

const InklingCollaborationContext = React.createContext<InklingCollaborationContextValue>({
  createWebsocketProvider: noopWebsocketProviderFactory,
})

export default InklingCollaborationContext
