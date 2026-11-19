import { SnippetInput } from '@kobato/inkling-internal/components/ui/SnippetInput'
import { useInklingSnippetSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { focusEditorRoot } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { createSnippetFromSource } from '@kobato/inkling-internal/plugins/behaviour/snippet-creation'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export interface SnippetActionToolbarProps {
  onClose?: () => void
}

export function SnippetActionToolbar({ onClose }: SnippetActionToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const { snippets, createSnippet } = useInklingSnippetSettings()
  const [name, setName] = React.useState('')

  const handleClose = React.useCallback(() => {
    onClose?.()
    focusEditorRoot(editor)
  }, [editor, onClose])

  const handleSnippetCreation = React.useCallback(
    (snippetName: string) => {
      if (createSnippetFromSource(editor, { kind: 'selection' }, snippetName, createSnippet)) {
        handleClose()
      }
    },
    [createSnippet, editor, handleClose],
  )

  return (
    <SnippetInput
      snippets={snippets ?? []}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onClose={handleClose}
      onCreateSnippet={() => handleSnippetCreation(name)}
      onUpdateSnippet={(snippetName) => handleSnippetCreation(snippetName)}
    />
  )
}
