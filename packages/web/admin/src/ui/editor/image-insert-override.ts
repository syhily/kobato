import type { LexicalEditor } from '@kobato/inkling'

import { parseAssetUrlPath, STORAGE_ROUTE_PREFIX } from '@kobato/assets/asset-url.ts'
import {
  COMMAND_PRIORITY_HIGH,
  INSERT_CARD_COMMAND,
  INSERT_IMAGE_COMMAND,
  OPEN_IMAGE_LIBRARY_COMMAND,
} from '@kobato/inkling'
import { KobatoImageNode } from '@kobato/web-admin/ui/editor/kobato-image-node.ts'

export function toSiteOwnedImageSrc(publicUrl: string): string {
  try {
    const parsed = parseAssetUrlPath(new URL(publicUrl, window.location.origin).pathname)
    if (parsed?.route === STORAGE_ROUTE_PREFIX) {
      return `${STORAGE_ROUTE_PREFIX}${parsed.key}`
    }
  } catch {}
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
