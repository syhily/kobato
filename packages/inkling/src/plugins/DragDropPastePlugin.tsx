import { useInklingHostEssentials } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import {
  registerDragOverSuppression,
  registerFileDropCommands,
} from '@kobato/inkling-internal/plugins/behaviour/file-drop'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback, useEffect } from 'react'
function DragDropPastePlugin() {
  const [editor] = useLexicalComposerContext()
  const { fileUploader } = useInklingHostEssentials()

  const hasUploader = useCallback(() => !!fileUploader, [fileUploader])
  const fileTypes = useCallback(() => fileUploader?.fileTypes, [fileUploader])

  useEffect(() => registerFileDropCommands(editor, { hasUploader, fileTypes }), [editor, hasUploader, fileTypes])
  useEffect(() => registerDragOverSuppression(editor), [editor])

  return null
}

export default DragDropPastePlugin
