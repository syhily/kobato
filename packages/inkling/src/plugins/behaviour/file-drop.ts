import type { FileUploader } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { LexicalEditor } from 'lexical'

import { INSERT_MEDIA_COMMAND, MIME_TEXT_HTML } from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import {
  claimDroppedFiles,
  getEditorAcceptableMimeTypes,
} from '@kobato/inkling-internal/plugins/behaviour/file-drop-routing'
import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $getRoot, $getSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, DROP_COMMAND } from 'lexical'

export interface FileDropPorts {
  hasUploader: () => boolean
  fileTypes: () => FileUploader['fileTypes']
}

export function handleFileDrop(editor: LexicalEditor, files: File[], ports: FileDropPorts): void {
  if (!ports.hasUploader()) {
    return
  }

  const acceptableMimeTypes = getEditorAcceptableMimeTypes(editor, ports.fileTypes())
  const claimed = claimDroppedFiles(files, acceptableMimeTypes)
  claimed.forEach((item) => {
    editor.dispatchCommand(INSERT_MEDIA_COMMAND, item)
  })
}

export function registerFileDropCommands(editor: LexicalEditor, ports: FileDropPorts): () => void {
  const unregisterDrop = editor.registerCommand(
    DROP_COMMAND,
    (event) => {
      if (!event.dataTransfer) {
        return false
      }
      const files = Array.from(event.dataTransfer.files)

      if (files.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        editor.dispatchCommand(DRAG_DROP_PASTE, files)
        return true
      }

      return false
    },
    COMMAND_PRIORITY_HIGH,
  )

  const unregisterBus = editor.registerCommand(
    DRAG_DROP_PASTE,
    (files) => {
      editor.focus()
      handleFileDrop(editor, files, ports)
      return false
    },
    COMMAND_PRIORITY_LOW,
  )

  return () => {
    unregisterDrop()
    unregisterBus()
  }
}

export function registerDragOverSuppression(editor: LexicalEditor): () => void {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return () => undefined
  }
  const handleDragOver = (event: DragEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!event.dataTransfer || target?.closest('[data-inkling-card]')) {
      return
    }
    event.stopPropagation()
    event.preventDefault()
  }

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
  }

  const handleDrop = (event: DragEvent) => {
    const { dataTransfer } = event
    if (!dataTransfer) {
      return
    }
    const html = dataTransfer.getData(MIME_TEXT_HTML)
    if (html) {
      event.preventDefault()

      editor.update(() => {
        editor.focus()
        let selection = $getSelection()
        if (!selection) {
          $getRoot().selectEnd()
          selection = $getSelection()
        }
        if (!selection) {
          return
        }
        $insertDataTransferForRichText(dataTransfer, selection, editor)
      })
    }
  }

  rootElement.addEventListener('dragover', handleDragOver)
  rootElement.addEventListener('dragleave', handleDragLeave)
  rootElement.addEventListener('drop', handleDrop)

  return () => {
    rootElement.removeEventListener('dragover', handleDragOver)
    rootElement.removeEventListener('dragleave', handleDragLeave)
    rootElement.removeEventListener('drop', handleDrop)
  }
}
