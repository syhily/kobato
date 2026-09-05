/**
 * The bookmark embed flow — the headless module behind `useBookmarkMetadata`
 * (the fetch choreography for a bookmark card's metadata): the loading/
 * urlError machine, the init-vs-submit divergence, and the defensive
 * `isEmbedResponse` classifier, composed from the tracked-request skeleton
 * (src/utils/services/service-machine.ts) over the request-track guard
 * (CONTEXT.md "request track") so the latest ISSUED fetch wins — an
 * impatient `submitUrl` supersedes a slower mount-time fetch, which
 * previously could resolve last and patch the node (or paste-as-link) over
 * the newer result. The React hook is the thin adapter: snapshot out,
 * intents in.
 */

import type { LexicalEditor, NodeKey } from 'lexical'

import { $getSelection, $setSelection } from 'lexical'

import type { BookmarkEmbedResponse, LinkingSettings } from '@/context/InklingHostIntegrationContext'

import { $isBookmarkNode, $updateCardNode } from '@/nodes/base'
import { focusEditorRoot } from '@/plugins/behaviour/card-adjacency'
import { createRequestTrack } from '@/utils/services/request-track'
import { runTrackedRequest } from '@/utils/services/service-machine'
import { createSnapshotStore } from '@/utils/services/snapshot-store'

// Keep the runtime boundary defensive for untyped JavaScript hosts even though
// TypeScript hosts now receive the closed bookmark response contract.
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
  /** The submit path: focuses the editor before the input dismounts, applies the submitted href, folds fetch failures into urlError. */
  submitUrl: (href: string) => Promise<void>
  /** The init path (a card constructed with a bare url): applies the response's canonical url and rejects on fetch failure so the caller can paste-as-link. */
  fetchInitialMetadata: (href: string) => Promise<void>
  /** Supersede every in-flight fetch (adapter teardown / recreation) — a late response then no-ops instead of patching the node. */
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
      focusEditorRoot(editor) // focus editor before causing the input element to dismount
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

    // an undefined response (no fetchEmbed, or a deliberate host skip)
    // falls through the same not-an-embed-response exit
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
      // loading-false render mounts the URL input, whose autoFocus steals
      // focus and drops the block cursor the selectNext caret earns. Focus
      // plus a dirty-selection no-op makes the reconciler re-render it. The
      // pre-race-guard code got this second application for free from
      // StrictMode's double fetch; with exactly one patch it must be said.
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
    /** Supersede every in-flight fetch (adapter teardown / recreation) — a late response then no-ops instead of patching the node. */
    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}
