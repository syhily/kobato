import type { LexicalEditor } from 'lexical'

import type { FileUploader } from '@/context/InklingHostIntegrationContext'
import type { EditorCardNode } from '@/nodes/cards/editor-card-nodes'

import { getEditorCardNodes } from '@/nodes/cards/editor-card-nodes'

// File-drop → media-claim routing: which dropped file becomes which card's
// `INSERT_MEDIA_COMMAND` payload (the command itself is owned by
// `clipboard-protocol.ts`, beside this module). Extracted from
// `DragDropPastePlugin.tsx` so the claim rules are headless and pure — the
// plugin keeps only the DOM drag/drop glue and the dispatch loop.
//
// The claim rule: a card declares an `uploadType` on its card declaration;
// the host's `fileUploader.fileTypes` config lists the mime types each upload
// type accepts. A dropped file is claimed by the first card whose configured
// mime list contains the file's type; files no card claims are dropped.

/**
 * A dropped file claimed by a card: `type` is the claiming card's node-type
 * key. The shape matches the `INSERT_MEDIA_COMMAND` payload
 * (`clipboard-protocol.ts`) verbatim, so claims dispatch unchanged.
 */
export interface ClaimedFile {
  type: string | undefined
  file: File
}

/**
 * The nodeType → acceptable-mime-types map, pure: each card with an
 * `uploadType` claims the mime list the host configures for that upload type.
 * A card whose upload type has no host `fileTypes` entry (or no host config
 * at all) gets an empty list and therefore claims nothing.
 */
export function getAcceptableMimeTypes(
  cardNodes: ReadonlyArray<[string, EditorCardNode]>,
  uploadFileTypes: FileUploader['fileTypes'],
): Record<string, string[]> {
  const acceptableMimeTypes: Record<string, string[]> = {}
  for (const [nodeType, card] of cardNodes) {
    if (card.uploadType) {
      acceptableMimeTypes[nodeType] = uploadFileTypes?.[card.uploadType]?.mimeTypes ?? []
    }
  }
  return acceptableMimeTypes
}

/**
 * The editor-reading leg: the editor's registered cards
 * (`getEditorCardNodes`) × the host's `fileUploader.fileTypes` config.
 */
export function getEditorAcceptableMimeTypes(
  editor: LexicalEditor,
  uploadFileTypes: FileUploader['fileTypes'],
): Record<string, string[]> {
  return getAcceptableMimeTypes(getEditorCardNodes(editor), uploadFileTypes)
}

/**
 * Claim each dropped file for the first card whose mime list contains the
 * file's type, preserving input order; files no card claims are filtered out.
 */
export function claimDroppedFiles(files: File[], acceptableMimeTypes: Record<string, string[]>): ClaimedFile[] {
  const claimed: ClaimedFile[] = []
  for (const file of files) {
    const type = Object.keys(acceptableMimeTypes).find((nodeType) => acceptableMimeTypes[nodeType].includes(file.type))
    if (type) {
      claimed.push({ type, file })
    }
  }
  return claimed
}
