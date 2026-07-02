import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import React from 'react'

import { SnippetInput } from '@/ui/inkling-editor/components/ui/SnippetInput'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'

export interface SnippetCreateToolbarProps {
  nodeKey: string
  onClose: () => void
}

export function SnippetCreateToolbar({ nodeKey, onClose }: SnippetCreateToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const { cardConfig } = React.useContext(InklingComposerContext)
  const [name, setName] = React.useState('')

  const handleClose = React.useCallback(() => {
    onClose()
    // return focus to the editor so subsequent keyboard actions (e.g. typing
    // a slash command) work without an explicit click
    editor.getRootElement()?.focus({ preventScroll: true })
  }, [editor, onClose])

  const handleCreateSnippet = React.useCallback(() => {
    const createSnippet = cardConfig?.createSnippet
    if (!createSnippet || !name) {
      return
    }

    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) {
        return
      }
      const value = JSON.stringify({ nodes: [node.exportJSON()] })
      createSnippet({ name, value })
    })

    handleClose()
  }, [cardConfig, editor, name, nodeKey, handleClose])

  return (
    <SnippetInput
      snippets={[]}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onClose={handleClose}
      onCreateSnippet={handleCreateSnippet}
    />
  )
}
