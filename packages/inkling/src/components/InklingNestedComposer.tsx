import type { InitialEditorStateType } from '@lexical/react/LexicalComposer'

import { useCollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalNestedComposer, type LexicalNestedComposerProps } from '@lexical/react/LexicalNestedComposer'
import React from 'react'

import InklingCollaborationContext from '@/context/InklingCollaborationContext'
import { useWordCountCallback, useWordCountLanguage } from '@/hooks/useWordCountCallback'
import ReplacementStringsPlugin from '@/plugins/ReplacementStringsPlugin'
import TKPlugin from '@/plugins/TKPlugin'
import WordCountPlugin from '@/plugins/WordCountPlugin'

// mirrors LexicalNestedComposer; initialEditorState is only used to bootstrap
// the collaboration plugin when collab is active
export interface InklingNestedComposerProps extends Pick<
  LexicalNestedComposerProps,
  'initialEditor' | 'initialNodes' | 'initialTheme' | 'skipCollabChecks' | 'skipEditableListener' | 'children'
> {
  initialEditorState?: InitialEditorStateType
}

const InklingNestedComposer = ({
  initialEditor,
  initialEditorState,
  // oxlint-disable-next-line typescript/no-deprecated -- load-bearing: per-card nested-editor node sets arrive via this prop; migrating to createEditor({nodes}) at editor-creation time is a separate architecture change
  initialNodes,
  initialTheme,
  skipCollabChecks,
  skipEditableListener,
  children,
}: InklingNestedComposerProps) => {
  const { isCollabActive } = useCollaborationContext()
  const { createWebsocketProvider } = React.useContext(InklingCollaborationContext)
  // reactive: re-renders when the top-level plugin publishes its callback, so
  // a nested composer rendered first still mounts its own WordCountPlugin
  const wordCountOnChange = useWordCountCallback()
  const wordCountLanguage = useWordCountLanguage()

  return (
    <LexicalNestedComposer
      initialEditor={initialEditor}
      // oxlint-disable-next-line typescript/no-deprecated -- load-bearing: per-card nested-editor node sets arrive via this prop; migrating to createEditor({nodes}) at editor-creation time is a separate architecture change
      initialNodes={initialNodes}
      initialTheme={initialTheme}
      skipCollabChecks={skipCollabChecks}
      skipEditableListener={skipEditableListener}
    >
      {isCollabActive ? (
        <CollaborationPlugin
          id={initialEditor.getKey()}
          initialEditorState={initialEditorState}
          providerFactory={createWebsocketProvider}
          shouldBootstrap={true}
        />
      ) : null}
      {wordCountOnChange ? (
        <WordCountPlugin language={wordCountLanguage ?? undefined} onChange={wordCountOnChange} />
      ) : null}
      <TKPlugin />
      <ReplacementStringsPlugin />
      {children}
    </LexicalNestedComposer>
  )
}

export default InklingNestedComposer
