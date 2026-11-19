import type {
  BookmarkEmbedResponse,
  LinkingSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { LexicalEditor, NodeKey } from 'lexical'

import { $isBookmarkNode, $updateCardNode } from '@kobato/inkling-internal/nodes/base'
import { focusEditorRoot } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { createRequestTrack } from '@kobato/inkling-internal/services/request-track'
import { runTrackedRequest } from '@kobato/inkling-internal/services/service-machine'
import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'
import { $getSelection, $setSelection } from 'lexical'

// The runtime boundary stays defensive: untyped JavaScript hosts bypass the
// closed response contract's type checking.
export function isEmbedResponse(value: unknown): value is BookmarkEmbedResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('url' in value) || typeof value.url !== 'string') {
    return false
  }
  if (!('metadata' in value)) {
    return false
  }
  const { metadata } = value
  if (typeof metadata !== 'object' || metadata === null) {
    return false
  }
  return (
    'author' in metadata &&
    typeof metadata.author === 'string' &&
    'icon' in metadata &&
    typeof metadata.icon === 'string' &&
    'title' in metadata &&
    typeof metadata.title === 'string' &&
    'description' in metadata &&
    typeof metadata.description === 'string' &&
    'publisher' in metadata &&
    typeof metadata.publisher === 'string' &&
    'thumbnail' in metadata &&
    typeof metadata.thumbnail === 'string'
  )
}

export interface BookmarkEmbedFlowSnapshot {
  loading: boolean
  urlError: boolean
}

export interface BookmarkEmbedFlow {
  getSnapshot: () => BookmarkEmbedFlowSnapshot
  subscribe: (listener: () => void) => () => void
  clearUrlError: () => void

  submitUrl: (href: string) => Promise<void>

  fetchInitialMetadata: (href: string) => Promise<void>

  dispose: () => void
}
export function createBookmarkEmbedFlow({
  editor,
  nodeKey,
  fetchEmbed,
}: {
  editor: LexicalEditor
  nodeKey: NodeKey
  fetchEmbed: LinkingSettings['fetchEmbed'] | undefined
}): BookmarkEmbedFlow {
  const store = createSnapshotStore<BookmarkEmbedFlowSnapshot>({ loading: false, urlError: false })
  const track = createRequestTrack()

  const fetchAndApply = async (href: string, init: boolean): Promise<void> => {
    const generation = track.next()
    if (!init) {
      focusEditorRoot(editor)
    }
    store.emit({ loading: true })

    const outcome = await runTrackedRequest(track, generation, () =>
      Promise.resolve(fetchEmbed?.(href, { type: 'bookmark' })),
    )
    // a newer fetch was issued while this one was in flight — it owns the
    // card: no error state, and no init rethrow (no paste-as-link over the
    // newer flow)
    if (!outcome) {
      return
    }

    // a rejected embed folds into urlError; the init path rethrows so the
    // caller can paste-as-link
    if (!outcome.ok) {
      store.emit({ loading: false, urlError: true })
      if (init) {
        throw outcome.error
      }
      return
    }

    if (!isEmbedResponse(outcome.value)) {
      store.emit({ loading: false, urlError: true })
      return
    }
    const response = outcome.value

    editor.update(() => {
      $updateCardNode(nodeKey, $isBookmarkNode, (node) => {
        node.url = init ? response.url : href
        node.author = response.metadata.author
        node.icon = response.metadata.icon
        node.title = response.metadata.title
        node.description = response.metadata.description
        node.publisher = response.metadata.publisher
        node.thumbnail = response.metadata.thumbnail

        if (init) {
          node.selectNext()
        }
      })
    })
    store.emit({ loading: false })

    if (init) {
      // re-apply the selection once the populated card has rendered: the
      // loading-false render mounts the URL input, whose autoFocus steals focus
      // and drops the block cursor the selectNext caret earns. Focus plus a
      // dirty-selection no-op makes the reconciler re-render it.
      setTimeout(() => {
        focusEditorRoot(editor)
        editor.update(() => {
          const selection = $getSelection()
          if (selection) {
            $setSelection(selection.clone())
          }
        })
      }, 0)
    }
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    clearUrlError: () => {
      store.emit({ urlError: false })
    },
    submitUrl: (href: string) => fetchAndApply(href, false),
    fetchInitialMetadata: (href: string) => fetchAndApply(href, true),

    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}
