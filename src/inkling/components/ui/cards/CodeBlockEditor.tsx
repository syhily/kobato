import type { LanguageSupport } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'

import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView as CodeMirrorEditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import React from 'react'

import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'
import { darkBaseExtensions, lightBaseExtensions } from '@/inkling/utils/codemirror-config'

// The CodeMirror-backed code editor, split out of CodeBlockCard.tsx so the
// CodeMirror family loads in its own chunk behind the card's lazy boundary —
// this module must only be reached through React.lazy.

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
    <div className="not-inkling-prose min-h-[17rem]">
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
        className={`border-grey-300 text-grey-900 dark:border-grey-900 dark:text-grey-400 absolute top-1.5 right-1.5 z-999 w-1/5 rounded-md border px-2 py-1 font-sans text-[1.3rem] leading-4 transition-opacity focus-visible:outline-none ${showLanguage ? 'opacity-100' : 'opacity-0'}`}
        data-testid="code-card-language"
        placeholder={labels['codeblock.language.placeholder']}
        type="text"
        value={language}
        onChange={onLanguageChange}
      />
    </div>
  )
}
