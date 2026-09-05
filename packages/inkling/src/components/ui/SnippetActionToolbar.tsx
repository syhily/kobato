import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { SnippetInput } from '@/components/ui/SnippetInput'
import { useInklingSnippetSettings } from '@/context/InklingHostIntegrationContext'
import { focusEditorRoot } from '@/plugins/behaviour/card-adjacency'
import { createSnippetFromSource } from '@/plugins/behaviour/snippet-creation'

export interface SnippetActionToolbarProps {
  onClose?: () => void
}

export function SnippetActionToolbar({ onClose }: SnippetActionToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const { snippets, createSnippet } = useInklingSnippetSettings()
  const [name, setName] = React.useState('')

  const handleClose = React.useCallback(() => {
    onClose?.()
    // return focus to the editor so subsequent keyboard actions (e.g. typing
    // a slash command) work without an explicit click
    focusEditorRoot(editor)
  }, [editor, onClose])

  // the guard and the value derivation live in the headless snippet-creation
  // module; a guard failure keeps the toolbar open
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
