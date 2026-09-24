import type { EditorState, LexicalEditor } from 'lexical'

import React from 'react'

import { CardCaptionEditor } from '@/inkling/components/ui/CardCaptionEditor'
import { CodeBlockPlainEditor, codeBlockPreClass } from '@/inkling/components/ui/cards/CodeBlockPlainEditor'
import { LazyCardEditor } from '@/inkling/components/ui/cards/LazyCardEditor'
import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'

// The CodeMirror-backed editor loads behind the hydration-safe lazy boundary
// (LazyCardEditor): the SSR'd canvas and the first client render both show
// the static code-box fallback, then the editor chunk takes over after mount.
const LazyCodeEditor = React.lazy(() =>
  import('@/inkling/components/ui/cards/CodeBlockEditor').then((module) => ({ default: module.CodeEditor })),
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
    // plain surfaces (the host's comment composer) edit the source in a
    // static textarea — no lazy boundary, so the codemirror chunk is never
    // fetched; the rich path is byte-identical to before the split
    if (codeEditor === 'plain') {
      return <CodeBlockPlainEditor code={code} language={language} updateCode={updateCode} onEscape={onEscape} />
    }
    return (
      <LazyCardEditor
        fallback={
          // static read-only mirror of the editor's initial state — the
          // display-mode code box at the editing container's min-height
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
