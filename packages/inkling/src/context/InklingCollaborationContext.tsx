import type { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'

import { type ComponentProps, createContext } from 'react'
export type LexicalProviderFactory = ComponentProps<typeof CollaborationPlugin>['providerFactory']

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

const InklingCollaborationContext = createContext<InklingCollaborationContextValue>({
  createWebsocketProvider: noopWebsocketProviderFactory,
})

export default InklingCollaborationContext
