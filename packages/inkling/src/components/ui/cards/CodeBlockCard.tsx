import type { LanguageSupport } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { EditorState, LexicalEditor } from 'lexical'

import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView as CodeMirrorEditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import React from 'react'

import { CardCaptionEditor } from '@/components/ui/CardCaptionEditor'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { darkBaseExtensions, lightBaseExtensions } from '@/utils/codemirror-config'

const languageMap = new Map<string, () => LanguageSupport>([
  ['javascript', javascript],
  ['js', javascript],
  ['html', html],
  ['css', css],
])

interface CodeEditorProps {
  code?: string
  language?: string
  updateCode?: (value: string) => void
  updateLanguage?: (value: string) => void
  onEscape?: () => void
}

export function CodeEditor({ code, language, updateCode, updateLanguage, onEscape }: CodeEditorProps) {
  const [showLanguage, setShowLanguage] = React.useState(true)
  const { darkMode } = React.useContext(InklingUiPrefsContext)
  const labels = useInklingLabels()
  const viewRef = React.useRef<EditorView | null>(null)
  const codeRef = React.useRef(code)

  // Keep a ref to the latest code prop so the unmount cleanup can compare
  // against it and avoid triggering a Lexical update when nothing changed.
  React.useEffect(() => {
    codeRef.current = code
  }, [code])

  // show the language input when the mouse moves
  React.useEffect(() => {
    const onMouseMove = () => {
      setShowLanguage(true)
    }

    window.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  // Sync CodeMirror's current document back to the Lexical node when the
  // editor unmounts. This catches operations such as undo/redo and cut that
  // don't always fire @uiw/react-codemirror's onChange in Playwright/Chrome
  // for Testing, so the display-mode render and serialized state stay correct.
  React.useEffect(() => {
    return () => {
      const view = viewRef.current
      if (view && updateCode) {
        const value = view.state.doc.toString()
        if (value !== codeRef.current) {
          updateCode(value)
        }
      }
    }
  }, [updateCode])

  const onChange = React.useCallback(
    (value: string) => {
      setShowLanguage(false) // hide language input whenever the user types in the editor
      updateCode?.(value)
    },
    [updateCode],
  )

  const onCreateEditor = React.useCallback((view: EditorView) => {
    viewRef.current = view
  }, [])

  const onLanguageChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateLanguage?.(event.target.value)
    },
    [updateLanguage],
  )

  const extensions = React.useMemo(() => {
    const base = darkMode ? darkBaseExtensions : lightBaseExtensions
    const highlighter = languageMap.get((language ?? '').toLowerCase().trim())
    const escapeHandler = CodeMirrorEditorView.domEventHandlers({
      keydown: (event: Event, _view: EditorView) => {
        if (event instanceof KeyboardEvent && event.key === 'Escape') {
          onEscape?.()
          return true
        }
        return false
      },
    })
    return highlighter ? [...base, highlighter(), escapeHandler] : [...base, escapeHandler]
  }, [darkMode, language, onEscape])

  return (
    <div className="not-inkling-prose min-h-[170px]">
      <CodeMirror
        autoFocus={true}
        basicSetup={false}
        extensions={extensions}
        value={code}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
      />
      <input
        aria-label={labels['aria.codeblockLanguage']}
        className={`absolute top-1.5 right-1.5 z-999 w-1/5 rounded-md border border-grey-300 px-2 py-1 font-sans text-[1.3rem] leading-4 text-grey-900 transition-opacity focus-visible:outline-none dark:border-grey-900 dark:text-grey-400 ${showLanguage ? 'opacity-100' : 'opacity-0'}`}
        data-testid="code-card-language"
        placeholder={labels['codeblock.language.placeholder']}
        type="text"
        value={language}
        onChange={onLanguageChange}
      />
    </div>
  )
}

interface CodeBlockProps {
  code?: string
  darkMode?: boolean
  language?: string
}

export function CodeBlock({ code, darkMode, language }: CodeBlockProps) {
  const preClass = darkMode
    ? `rounded-md border border-grey-950 bg-grey-950 px-2 py-[6px] font-mono text-[1.6rem] leading-9 text-grey-400 whitespace-pre-wrap`
    : `rounded-md border border-grey-200 bg-grey-100 px-2 py-[6px] font-mono text-[1.6rem] leading-9 text-grey-900 whitespace-pre-wrap`
  return (
    <div className="not-inkling-prose">
      <pre className={preClass}>
        <code className={language && `language-${language}`}>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 flex items-center justify-center px-1">
        <span className="block font-sans text-sm leading-normal font-medium text-grey">{language}</span>
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

  if (isEditing) {
    return (
      <CodeEditor
        code={code}
        language={language}
        onEscape={onEscape}
        updateCode={updateCode}
        updateLanguage={updateLanguage}
      />
    )
  } else {
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
}
