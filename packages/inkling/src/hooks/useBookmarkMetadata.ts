import type { LinkingSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { LexicalEditor, NodeKey } from 'lexical'

import { createBookmarkEmbedFlow } from '@kobato/inkling-internal/hooks/bookmark-embed-flow'
import { useDisposableStore } from '@kobato/inkling-internal/hooks/useDisposableStore'
import { useSyncExternalStore } from 'react'
interface UseBookmarkMetadataOptions {
  editor: LexicalEditor
  nodeKey: NodeKey
  fetchEmbed: LinkingSettings['fetchEmbed'] | undefined
}

export interface UseBookmarkMetadataResult {
  loading: boolean
  urlError: boolean
  clearUrlError: () => void
  submitUrl: (href: string) => Promise<void>

  fetchInitialMetadata: (href: string) => Promise<void>
}

export function useBookmarkMetadata({
  editor,
  nodeKey,
  fetchEmbed,
}: UseBookmarkMetadataOptions): UseBookmarkMetadataResult {
  const flow = useDisposableStore(
    () => createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed }),
    [editor, nodeKey, fetchEmbed],
  )
  const { loading, urlError } = useSyncExternalStore(flow.subscribe, flow.getSnapshot)

  return {
    loading,
    urlError,
    clearUrlError: flow.clearUrlError,
    submitUrl: flow.submitUrl,
    fetchInitialMetadata: flow.fetchInitialMetadata,
  }
}
