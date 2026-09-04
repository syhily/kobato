// R11 host glue (plan docs/plans/inkling-editor-replacement.md, M3): with
// KobatoImageNode registered for node type 'image', the stock per-card
// command handlers still MOUNT — `editor.hasNodes` gates on the type string,
// which the subclass inherits — but the stock INSERT_IMAGE_COMMAND handler
// (CardInsertPlugin, LOW) would construct the stock assembled class and
// silently drop the four kobato dataset keys, and InklingSelectorPlugin's
// OPEN_IMAGE_LIBRARY_COMMAND handler (LOW) would open inkling's selector
// overlay (LibraryPlugin is entry-internal). Both are intercepted here at
// HIGH priority, returning true so the stock LOW handlers never fire:
//
// - INSERT_IMAGE_COMMAND (slash menu, file-dialog insert, library pick,
//   and the INSERT_MEDIA_COMMAND paste/drop leg — its stock HIGH handler
//   only re-dispatches this command with `{ initialFile }`, so it needs no
//   override): construct KobatoImageNode, then hand it to the shared
//   INSERT_CARD_COMMAND choreography (InklingBehaviourPlugin, unconditional).
// - OPEN_IMAGE_LIBRARY_COMMAND: open the host's own ImageLibraryPicker
//   dialog; the pick re-enters through INSERT_IMAGE_COMMAND with the full
//   dataset (thumbhash/storagePath/imageId included).
//
// inkling does not re-export Lexical's command-priority constants:
// COMMAND_PRIORITY_HIGH = 3.

import type { LexicalEditor } from '@inkling/editor'

import { INSERT_CARD_COMMAND, INSERT_IMAGE_COMMAND, OPEN_IMAGE_LIBRARY_COMMAND } from '@inkling/editor'

import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import { parseAssetUrlPath, STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'

const COMMAND_PRIORITY_HIGH = 3

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

export function registerKobatoImageInsertCommands(editor: LexicalEditor, openImageLibrary: () => void): () => void {
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
      openImageLibrary()
      return true
    },
    COMMAND_PRIORITY_HIGH,
  )
  return () => {
    unregisterInsert()
    unregisterLibrary()
  }
}
