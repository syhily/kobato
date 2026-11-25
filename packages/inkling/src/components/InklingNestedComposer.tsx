import type { InitialEditorStateType } from 'lexical'

import InklingCollaborationContext from '@kobato/inkling-internal/context/InklingCollaborationContext'
import {
  useWordCountCallback,
  useWordCountLanguage,
  useWordCountSelectionCallback,
} from '@kobato/inkling-internal/hooks/useWordCountCallback'
import ReplacementStringsPlugin from '@kobato/inkling-internal/plugins/ReplacementStringsPlugin'
import TKPlugin from '@kobato/inkling-internal/plugins/TKPlugin'
import WordCountPlugin from '@kobato/inkling-internal/plugins/WordCountPlugin'
import { useCollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalNestedComposer, type LexicalNestedComposerProps } from '@lexical/react/LexicalNestedComposer'
import { useContext } from 'react'
export interface InklingNestedComposerProps extends Pick<
  LexicalNestedComposerProps,
  'initialEditor' | 'initialNodes' | 'initialTheme' | 'skipCollabChecks' | 'skipEditableListener' | 'children'
> {
  initialEditorState?: InitialEditorStateType
}

const InklingNestedComposer = ({
  initialEditor,
  initialEditorState,
  // oxlint-disable-next-line typescript/no-deprecated
  initialNodes,
  initialTheme,
  skipCollabChecks,
  skipEditableListener,
  children,
}: InklingNestedComposerProps) => {
  const { isCollabActive } = useCollaborationContext()
  const { createWebsocketProvider } = useContext(InklingCollaborationContext)

  const wordCountOnChange = useWordCountCallback()
  const wordCountOnSelectionChange = useWordCountSelectionCallback()
  const wordCountLanguage = useWordCountLanguage()

  return (
    <LexicalNestedComposer
      initialEditor={initialEditor}
      // oxlint-disable-next-line typescript/no-deprecated
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
      {wordCountOnChange || wordCountOnSelectionChange ? (
        <WordCountPlugin
          language={wordCountLanguage ?? undefined}
          onChange={wordCountOnChange ?? undefined}
          onSelectionChange={wordCountOnSelectionChange ?? undefined}
        />
      ) : null}
      <TKPlugin />
      <ReplacementStringsPlugin />
      {children}
    </LexicalNestedComposer>
  )
}

export default InklingNestedComposer
