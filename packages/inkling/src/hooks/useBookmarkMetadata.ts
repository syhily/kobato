import type { LexicalEditor, NodeKey } from 'lexical'

import React from 'react'

import type { LinkingSettings } from '@/context/InklingHostIntegrationContext'

import { createBookmarkEmbedFlow } from '@/hooks/bookmark-embed-flow'
import { useDisposableStore } from '@/hooks/useDisposableStore'

interface UseBookmarkMetadataOptions {
  editor: LexicalEditor
  nodeKey: NodeKey
  fetchEmbed: LinkingSettings['fetchEmbed'] | undefined
}

export interface UseBookmarkMetadataResult {
  loading: boolean
  urlError: boolean
  clearUrlError: () => void
  // the submit path: focuses the editor before the input dismounts, applies
  // the submitted href, and folds fetch failures into the urlError state
  submitUrl: (href: string) => Promise<void>
  // the init path (a card constructed with a bare url): applies the
  // response's canonical url and rejects on fetch failure so the caller can
  // paste-as-link
  fetchInitialMetadata: (href: string) => Promise<void>
}

// the fetch choreography, the loading/urlError machine, and the
// isEmbedResponse classifier live in @/hooks/bookmark-embed-flow
// (a request-track guard, so the latest issued fetch wins the node patch);
// this hook is the subscription adapter
export function useBookmarkMetadata({
  editor,
  nodeKey,
  fetchEmbed,
}: UseBookmarkMetadataOptions): UseBookmarkMetadataResult {
  // a recreated flow supersedes the old one's in-flight fetches, so a late
  // response from the stale instance no-ops instead of patching the node
  const flow = useDisposableStore(
    () => createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed }),
    [editor, nodeKey, fetchEmbed],
  )
  const { loading, urlError } = React.useSyncExternalStore(flow.subscribe, flow.getSnapshot)

  return {
    loading,
    urlError,
    clearUrlError: flow.clearUrlError,
    submitUrl: flow.submitUrl,
    fetchInitialMetadata: flow.fetchInitialMetadata,
  }
}
