import type { WebsocketProvider } from 'y-websocket'
import type { Doc } from 'yjs'

import React from 'react'

import type { ListOptionItem, SearchResult } from '@/ui/inkling-editor/hooks/useSearchLinks'
import type { DragDropHandler } from '@/ui/inkling-editor/utils/draggable/DragDropHandler'

export interface FileUploader {
  useFileUpload: (type: 'image' | 'video' | 'audio' | 'file' | 'mediaThumbnail') => {
    isLoading?: boolean
    upload: (
      files: FileList | File[],
      options?: { formData?: Record<string, string> },
    ) => Promise<Array<{ url?: string }> | undefined>
    errors?: Error[]
  }
  fileTypes?: {
    image?: { mimeTypes: string[] }
    video?: { mimeTypes: string[] }
    audio?: { mimeTypes: string[] }
    file?: { mimeTypes: string[] }
  }
}

export interface CardConfig {
  visibilitySettings?: string
  stripeEnabled?: boolean
  feature?: boolean | object
  createSnippet?: (args: { name: string; value: string }) => void | Promise<void>
  deleteSnippet?: (args: { name: string; value: string }) => void | Promise<void>
  snippets?: Array<{ name: string; value: string }>
  fetchEmbed?: (href: string, opts: object) => Promise<unknown>
  searchLinks?: (term?: string) => Promise<SearchResult[] | undefined>
  fetchAutocompleteLinks?: () => Promise<ListOptionItem[] | undefined>
  siteUrl?: string
  pinturaConfig?: object
  renderLabels?: boolean
  fetchLabels?: () => Promise<unknown[]>
  image?: { allowedWidths?: string[] }
  klipy?: { apiKey?: string; contentFilter?: string }
  tenor?: { googleApiKey?: string; contentFilter?: string }
  post?: { displayName?: string }
  [key: string]: unknown
}

export interface InklingComposerContextValue {
  fileUploader: FileUploader
  cardConfig: CardConfig
  darkMode: boolean
  enableMultiplayer: boolean
  isTKEnabled?: boolean
  multiplayerEndpoint?: string
  multiplayerDocId?: string
  multiplayerUsername?: string
  editorContainerRef: React.RefObject<HTMLElement | null>
  createWebsocketProvider: (id: string, yjsDocMap: Map<string, Doc>) => WebsocketProvider
  onWordCountChangeRef: React.MutableRefObject<((count: number) => void) | null>
  dragDropHandler?: DragDropHandler
  onError: (error: Error) => void
}

const InklingComposerContext = React.createContext<InklingComposerContextValue>({
  fileUploader: {
    useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
  },
  cardConfig: {},
  darkMode: false,
  enableMultiplayer: false,
  editorContainerRef: { current: null },
  createWebsocketProvider: () => ({}) as WebsocketProvider,
  onWordCountChangeRef: { current: null },
  onError: () => {},
})

export default InklingComposerContext
