// R11 host glue (plan docs/plans/inkling-editor-replacement.md, M3; the
// library pick moved onto the pick seam in the landing-4 de-hack): with
// KobatoImageNode registered for node type 'image', the stock per-card
// command handlers still MOUNT — `editor.hasNodes` gates on the type string,
// which the subclass inherits — but they are CLASS-identity gates that would
// construct the stock assembled class (dropping the four kobato dataset keys)
// or mount inkling's entry-internal selector overlay. What remains here is
// exactly those two gates, intercepted at HIGH priority (the barrel's
// COMMAND_PRIORITY_HIGH) so the stock LOW handlers never fire:
//
// - INSERT_IMAGE_COMMAND (slash menu insert, file-dialog insert, and the
//   INSERT_MEDIA_COMMAND paste/drop leg — its stock HIGH handler only
//   re-dispatches this command with `{ initialFile }`, so it needs no
//   override): construct KobatoImageNode, then hand it to the shared
//   INSERT_CARD_COMMAND choreography (InklingBehaviourPlugin, unconditional).
//   Uploads keep flowing through `pageEditorFileUploader` untouched — nothing
//   here opens the picker.
// - OPEN_IMAGE_LIBRARY_COMMAND (the 图片库 menu/toolbar intent only): insert
//   an EMPTY KobatoImageNode with the payload's `openPicker` flag — the pick
//   seam (`registerCardPicker('image', …)` in `./image-library-pick`) opens
//   the host's ImageLibraryPicker on the fresh node, and the pick writes the
//   library dataset onto it. inkling's stock LOW handler would mount its own
//   LibraryPlugin overlay on a stock-class node instead.

import type { LexicalEditor } from '@/inkling'

import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import { COMMAND_PRIORITY_HIGH, INSERT_CARD_COMMAND, INSERT_IMAGE_COMMAND, OPEN_IMAGE_LIBRARY_COMMAND } from '@/inkling'
import { parseAssetUrlPath, STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'

/**
 * Content stores origin-relative `/storage/<key>` srcs (the site-owned asset
 * URL policy) so a backend/CDN switch never breaks bodies; the library DTO's
 * `publicUrl` is absolute. Anything outside the site-owned grammar (external
 * URL) passes through untouched.
 */
export function toSiteOwnedImageSrc(publicUrl: string): string {
  try {
    const parsed = parseAssetUrlPath(new URL(publicUrl, window.location.origin).pathname)
    if (parsed?.route === STORAGE_ROUTE_PREFIX) {
      return `${STORAGE_ROUTE_PREFIX}${parsed.key}`
    }
  } catch {
    // fall through — unparseable URLs pass through untouched
  }
  return publicUrl
}

export function registerKobatoImageInsertCommands(editor: LexicalEditor): () => void {
  const unregisterInsert = editor.registerCommand(
    INSERT_IMAGE_COMMAND,
    (dataset) => {
      if (typeof dataset !== 'object' || dataset === null) {
        return false
      }
      editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: new KobatoImageNode(dataset) })
      return true
    },
    COMMAND_PRIORITY_HIGH,
  )
  const unregisterLibrary = editor.registerCommand(
    OPEN_IMAGE_LIBRARY_COMMAND,
    () => {
      // Insert-empty-then-pick (the music card's shape): the seam's picker
      // host renders the registered 'image' picker for the fresh node.
      editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: new KobatoImageNode({}), openPicker: true })
      return true
    },
    COMMAND_PRIORITY_HIGH,
  )
  return () => {
    unregisterInsert()
    unregisterLibrary()
  }
}
