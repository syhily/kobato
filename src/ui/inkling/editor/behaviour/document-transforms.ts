import type { LexicalEditor } from 'lexical'

import { $isListNode, ListNode } from '@lexical/list'

/**
 * Document-normalisation transforms for the Inkling editor.
 *
 * These mirror Ghost Koenig's `kg-default-transforms` (see feasibility report
 * §3.2) but are re-implemented for Lexical 0.45 and the Inkling node set. They
 * run as node transforms so they fire on every edit and on paste/import — the
 * last line of defence against malformed content reaching the serializer.
 *
 * Registered together via {@link registerInklingDocumentTransforms}.
 */

// --- mergeListNodes ----------------------------------------------------------

/**
 * Merge an adjacent same-type list into `node` (if one follows it).
 *
 * When the user deletes the content between two bullet lists (or paste
 * produces fragmented lists), Lexical leaves them as separate ListNode
 * siblings. This collapses them into one so the renderer and keyboard
 * navigation see a single list. Must run inside an update.
 *
 * Returns true if a merge happened (so callers can decide whether to mark the
 * transform dirty).
 */
export function $mergeWithFollowingSiblingList(node: ListNode): boolean {
  const next = node.getNextSibling()
  if (
    next !== null &&
    $isListNode(next) &&
    next.getListType() === node.getListType() &&
    next.getTag() === node.getTag() &&
    next.getIndent() === node.getIndent()
  ) {
    for (const child of next.getChildren()) {
      node.append(child)
    }
    next.remove()
    return true
  }
  return false
}

// --- aggregator --------------------------------------------------------------

/**
 * Register all Inkling document-normalisation transforms. Returns a cleanup
 * function that unregisters them all.
 *
 * Currently wires:
 * - `mergeListNodes`: collapse adjacent same-type lists (registered on
 *   `ListNode` so it fires on every list mutation, including paste).
 *
 * `removeAlignment` (stripping text-align from prose elements) and `denest`
 * (lifting illegally-nested blocks out of prose elements) are deferred: they
 * need careful coordination with the paste sanitiser to avoid fighting it,
 * and `denest` risks damaging valid Solution/TwoColumn content. They will
 * land alongside a future paste-hardening pass with dedicated tests.
 */
export function registerInklingDocumentTransforms(editor: LexicalEditor): () => void {
  const unregisters: Array<() => void> = []

  unregisters.push(
    editor.registerNodeTransform(ListNode, (node) => {
      $mergeWithFollowingSiblingList(node)
    }),
  )

  return () => {
    for (const unregister of unregisters) {
      unregister()
    }
  }
}
