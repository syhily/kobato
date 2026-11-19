import type { FileUploader } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { EditorCardNode } from '@kobato/inkling-internal/nodes/cards/editor-card-nodes'
import type { LexicalEditor } from 'lexical'

import { getEditorCardNodes } from '@kobato/inkling-internal/nodes/cards/editor-card-nodes'

export interface ClaimedFile {
  type: string | undefined
  file: File
}
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
export function getEditorAcceptableMimeTypes(
  editor: LexicalEditor,
  uploadFileTypes: FileUploader['fileTypes'],
): Record<string, string[]> {
  return getAcceptableMimeTypes(getEditorCardNodes(editor), uploadFileTypes)
}

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
