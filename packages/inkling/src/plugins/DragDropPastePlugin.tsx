import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { useInklingHostEssentials } from '@/context/InklingHostIntegrationContext'
import { registerDragOverSuppression, registerFileDropCommands } from '@/plugins/behaviour/file-drop'

// The drop policies (claim flow, cursor suppression, html fallback, the
// DRAG_DROP_PASTE bus) live in @/plugins/behaviour/file-drop; this plugin
// keeps only the uploader context and mounts the registrations.
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
