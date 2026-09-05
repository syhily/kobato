import type { LexicalEditor } from 'lexical'

import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $getRoot, $getSelection, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, DROP_COMMAND } from 'lexical'

import type { FileUploader } from '@/context/InklingHostIntegrationContext'

import { INSERT_MEDIA_COMMAND, MIME_TEXT_HTML } from '@/plugins/behaviour/clipboard-protocol'
import { claimDroppedFiles, getEditorAcceptableMimeTypes } from '@/plugins/behaviour/file-drop-routing'

// File drop — the headless policies behind DragDropPastePlugin (the
// mime-claim RULES stay in file-drop-routing; this module owns the flow
// around them): dropped files always insert at the selection left behind —
// never the drop point — the dragover cursor suppression with its card
// carve-out, the html-drop fallback, and the DRAG_DROP_PASTE handler. The
// plugin keeps only the uploader context and mounts the registration.
//
// DRAG_DROP_PASTE ownership: upstream defines the command but registers no
// handler — inkling borrows it as the public files-arrived bus
// (ExternalControlPlugin.insertFiles and hosts dispatch it), and the
// registration below is its single handler. The false return is deliberate:
// it lets any host-registered lower-priority handler also run.

export interface FileDropPorts {
  /** The host uploader's presence — drops are ignored without one. */
  hasUploader: () => boolean
  /** The host's per-mime-type upload constraints (fileUploader.fileTypes). */
  fileTypes: () => FileUploader['fileTypes']
}

/**
 * Claims dropped files per acceptable mime type and dispatches each claim
 * through INSERT_MEDIA_COMMAND (the shared media insert path — the card
 * declarations' media claiming resolves there).
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
 * The drop-command half: DROP_COMMAND routes file drops onto the
 * DRAG_DROP_PASTE bus (pre-empting Lexical's default, which would insert at
 * the drop point), and the bus's single handler focuses the editor and
 * claims the files.
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
 * The DOM half: the dragover/dragleave suppression (drops keep the original
 * selection, so the cursor must not track the drag — except over a card,
 * whose own drop targets keep their native behavior) and the html-drop
 * fallback (rich-text insert at the current selection, defaulting to the
 * document end). Attaches to the editor root; returns the teardown (a no-op
 * when the editor has no root element).
 */
export function registerDragOverSuppression(editor: LexicalEditor): () => void {
  const rootElement = editor.getRootElement()
  if (!rootElement) {
    return () => {}
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
    // handle image drop from a browser window
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
