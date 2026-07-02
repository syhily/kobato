import type { BaseSelection, LexicalCommand, LexicalEditor } from 'lexical'

import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import {
  $getRoot,
  $getSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DROP_COMMAND,
} from 'lexical'
import React from 'react'

import type { FileUploader } from '@/ui/inkling-editor/context/InklingComposerContext'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { getEditorCardNodes } from '@/ui/inkling-editor/utils/getEditorCardNodes'

export const INSERT_MEDIA_COMMAND: LexicalCommand<{ type: string | undefined; file: File }> = createCommand()

interface ProcessedFile {
  type: string | undefined
  file: File
}

function isMimeType(file: File, acceptableMimeTypes: Record<string, string[]>): string | undefined {
  const mimeType = file.type
  const key = Object.keys(acceptableMimeTypes).find((k) => acceptableMimeTypes[k].includes(mimeType))
  return key
}

function mediaFileReader(
  files: File[],
  acceptableMimeTypes: Record<string, string[]>,
): Promise<{ processed: ProcessedFile[] }> {
  const filesIterator = files[Symbol.iterator]()
  return new Promise((resolve, reject) => {
    const processed: ProcessedFile[] = []
    const handleNextFile = () => {
      const { done, value: file } = filesIterator.next()
      if (done) {
        return resolve({ processed })
      }
      const fileReader = new FileReader()
      fileReader.addEventListener('error', reject)
      fileReader.addEventListener('load', () => {
        const result = fileReader.result
        const nodeType = isMimeType(file, acceptableMimeTypes)
        if (typeof result === 'string') {
          processed.push({ type: nodeType, file: file })
        }
        handleNextFile()
      })
      const nodeType = isMimeType(file, acceptableMimeTypes)
      if (nodeType) {
        fileReader.readAsDataURL(file)
      } else {
        handleNextFile()
      }
    }
    handleNextFile()
  })
}

async function getListOfAcceptableMimeTypes(
  editor: LexicalEditor,
  uploadFileTypes: FileUploader['fileTypes'],
): Promise<{ acceptableMimeTypes: Record<string, string[]> }> {
  const nodes = getEditorCardNodes(editor)
  const acceptableMimeTypes: Record<string, string[]> = {}
  const uploadTypes = uploadFileTypes as Record<string, { mimeTypes: string[] } | undefined> | undefined
  for (const [nodeType, node] of nodes) {
    const nodeWithUpload = node as { uploadType?: string }
    if (nodeType && nodeWithUpload.uploadType) {
      acceptableMimeTypes[nodeType] = uploadTypes?.[nodeWithUpload.uploadType]?.mimeTypes ?? []
    }
  }
  return {
    acceptableMimeTypes,
  }
}

function DragDropPastePlugin() {
  const [editor] = useLexicalComposerContext()
  const { fileUploader } = React.useContext(InklingComposerContext)

  const handleFileUpload = React.useCallback(
    async (files: File[]): Promise<void> => {
      if (!fileUploader) {
        return
      }

      const { acceptableMimeTypes } = await getListOfAcceptableMimeTypes(editor, fileUploader.fileTypes)
      const { processed } = await mediaFileReader(files, acceptableMimeTypes)
      processed.forEach((item) => {
        editor.dispatchCommand(INSERT_MEDIA_COMMAND, item)
      })
    },
    [editor, fileUploader],
  )

  // override the default Lexical drop handler because we always want to insert
  // where the selection was left rather than where the drop happened (matches mobiledoc editor)
  React.useEffect(() => {
    return editor.registerCommand(
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
  }, [editor])

  // prevent drag over moving the cursor - our drops use the original selection
  // rather than the drop location
  React.useEffect(() => {
    const rootElement = editor.getRootElement()
    const handleDragOver = (event: DragEvent) => {
      const target = event.target as HTMLElement | null
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
      const html = dataTransfer.getData('text/html')
      if (html) {
        event.preventDefault()

        editor.update(() => {
          editor.focus()
          let selection = $getSelection()
          if (!selection) {
            $getRoot().selectEnd()
            selection = $getSelection()
          }
          $insertDataTransferForRichText(dataTransfer, selection as BaseSelection, editor)
        })
      }
    }

    if (!rootElement) {
      return
    }

    rootElement.addEventListener('dragover', handleDragOver)
    rootElement.addEventListener('dragleave', handleDragLeave)
    rootElement.addEventListener('drop', handleDrop)

    return () => {
      rootElement.removeEventListener('dragover', handleDragOver)
      rootElement.removeEventListener('dragleave', handleDragLeave)
      rootElement.removeEventListener('drop', handleDrop)
    }
  }, [editor])

  React.useEffect(() => {
    return editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        editor.focus()
        handleFileUpload(files).catch(() => {
          // upload errors are surfaced by the file uploader
        })
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, handleFileUpload])

  return null
}

export default DragDropPastePlugin
