import { SnippetInput } from '@kobato/inkling-internal/components/ui/SnippetInput'
import { useInklingSnippetSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { focusEditorRoot } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { createSnippetFromSource } from '@kobato/inkling-internal/plugins/behaviour/snippet-creation'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export interface SnippetCreateToolbarProps {
  nodeKey: string
  onClose: () => void
}

export function SnippetCreateToolbar({ nodeKey, onClose }: SnippetCreateToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const { createSnippet } = useInklingSnippetSettings()
  const [name, setName] = React.useState('')

  const handleClose = React.useCallback(() => {
    onClose()
    focusEditorRoot(editor)
  }, [editor, onClose])

  const handleCreateSnippet = React.useCallback(() => {
    if (createSnippetFromSource(editor, { kind: 'card', nodeKey }, name, createSnippet)) {
      handleClose()
    }
  }, [createSnippet, editor, name, nodeKey, handleClose])

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
