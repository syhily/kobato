import { useInklingHostEssentials } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import {
  registerDragOverSuppression,
  registerFileDropCommands,
} from '@kobato/inkling-internal/plugins/behaviour/file-drop'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

function DragDropPastePlugin() {
  const [editor] = useLexicalComposerContext()
  const { fileUploader } = useInklingHostEssentials()

  const hasUploader = React.useCallback(() => !!fileUploader, [fileUploader])
  const fileTypes = React.useCallback(() => fileUploader?.fileTypes, [fileUploader])

  React.useEffect(() => registerFileDropCommands(editor, { hasUploader, fileTypes }), [editor, hasUploader, fileTypes])
  React.useEffect(() => registerDragOverSuppression(editor), [editor])

  return null
}

export default DragDropPastePlugin
