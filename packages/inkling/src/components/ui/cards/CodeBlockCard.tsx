import type { EditorState, LexicalEditor } from 'lexical'

import { CardCaptionEditor } from '@kobato/inkling-internal/components/ui/CardCaptionEditor'
import {
  CodeBlockPlainEditor,
  codeBlockPreClass,
} from '@kobato/inkling-internal/components/ui/cards/CodeBlockPlainEditor'
import { LazyCardEditor } from '@kobato/inkling-internal/components/ui/cards/LazyCardEditor'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import React from 'react'

// The CodeMirror-backed editor loads behind the hydration-safe lazy boundary
// (LazyCardEditor): the SSR'd canvas and the first client render both show
// the static code-box fallback, then the editor chunk takes over after mount.
const LazyCodeEditor = React.lazy(() =>
  import('@kobato/inkling-internal/components/ui/cards/CodeBlockEditor').then((module) => ({
    default: module.CodeEditor,
  })),
)

interface CodeBlockProps {
  code?: string
  darkMode?: boolean
  language?: string
}

export function CodeBlock({ code, darkMode, language }: CodeBlockProps) {
  return (
    <div className="not-inkling-prose">
      <pre className={codeBlockPreClass(darkMode)}>
        <code className={language && `language-${language}`}>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 flex items-center justify-center px-1">
        <span className="text-grey block font-sans text-sm leading-normal font-medium">{language}</span>
      </div>
    </div>
  )
}

interface CodeBlockCardProps {
  captionEditor?: LexicalEditor | null
  captionEditorInitialState?: EditorState
  code?: string
  darkMode?: boolean
  isEditing?: boolean
  isSelected?: boolean
  language?: string
  updateCode?: (value: string) => void
  updateLanguage?: (value: string) => void
  onEscape?: () => void
}

export function CodeBlockCard({
  captionEditor,
  captionEditorInitialState,
  code,
  darkMode,
  isEditing,
  isSelected,
  language,
  updateCode,
  updateLanguage,
  onEscape,
}: CodeBlockCardProps) {
  const labels = useInklingLabels()
  const { codeEditor } = React.useContext(InklingUiPrefsContext)

  if (isEditing) {
    if (codeEditor === 'plain') {
      return <CodeBlockPlainEditor code={code} language={language} updateCode={updateCode} onEscape={onEscape} />
    }
    return (
      <LazyCardEditor
        fallback={
          <div className="min-h-[17rem]">
            <CodeBlock code={code} darkMode={darkMode} language={language} />
          </div>
        }
      >
        <LazyCodeEditor
          code={code}
          language={language}
          onEscape={onEscape}
          updateCode={updateCode}
          updateLanguage={updateLanguage}
        />
      </LazyCardEditor>
    )
  }
  return (
    <>
      <CodeBlock code={code} darkMode={darkMode} language={language} />
      <CardCaptionEditor
        captionEditor={captionEditor ?? null}
        captionEditorInitialState={captionEditorInitialState}
        captionPlaceholder={labels['caption.codeblock.placeholder']}
        dataTestId="codeblock-caption"
        isSelected={isSelected}
      />
    </>
  )
}
