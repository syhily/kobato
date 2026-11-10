import type { LexicalEditor } from 'lexical'

import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $getRoot, $getSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, DROP_COMMAND } from 'lexical'

import type { FileUploader } from '@/inkling/context/InklingHostIntegrationContext'

import { INSERT_MEDIA_COMMAND, MIME_TEXT_HTML } from '@/inkling/plugins/behaviour/clipboard-protocol'
import { claimDroppedFiles, getEditorAcceptableMimeTypes } from '@/inkling/plugins/behaviour/file-drop-routing'

// File drop: the headless policies behind DragDropPastePlugin (the mime-claim rules
// live in file-drop-routing). Dropped files always insert at the selection left
// behind, never at the drop point.
//
// DRAG_DROP_PASTE: upstream defines the command but registers no handler — inkling
// borrows it as the public files-arrived bus (ExternalControlPlugin.insertFiles and
// hosts dispatch it), and the registration below is its single handler. The false
// return is deliberate: it lets host-registered lower-priority handlers also run.

export interface FileDropPorts {
  /** The host uploader's presence — drops are ignored without one. */
  hasUploader: () => boolean
  /** The host's per-mime-type upload constraints (fileUploader.fileTypes). */
  fileTypes: () => FileUploader['fileTypes']
}

/**
 * Claims dropped files per acceptable mime type and dispatches each claim through
 * INSERT_MEDIA_COMMAND, the shared media insert path.
 */
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

/**
 * DROP_COMMAND routes file drops onto the DRAG_DROP_PASTE bus, pre-empting
 * Lexical's default, which would insert at the drop point; the bus's handler
 * focuses the editor and claims the files.
 */
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

/**
 * The DOM half: dragover/dragleave suppression (drops keep the original selection, so
 * the cursor must not track the drag — except over a card, whose own drop targets keep
 * native behaviour) and the html-drop fallback, which inserts rich text at the current
 * selection, defaulting to the document end. Returns the teardown; a no-op when the
 * editor has no root element.
 */
export function registerDragOverSuppression(editor: LexicalEditor): () => void {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return () => {
      /* noop — no root element, nothing was registered */
    }
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
    // image dragged in from a browser window
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
