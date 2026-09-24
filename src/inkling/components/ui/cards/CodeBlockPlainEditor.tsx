import React from 'react'

import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'

// The code box's display/edit shared styling — one source so the display-mode
// <pre> (CodeBlock in ./CodeBlockCard) and the plain editor's textarea stay
// visually continuous.
export function codeBlockPreClass(darkMode?: boolean): string {
  return darkMode
    ? `rounded-md border border-grey-950 bg-grey-950 px-2 py-[0.6rem] font-mono text-[1.6rem] leading-9 text-grey-400 whitespace-pre-wrap`
    : `rounded-md border border-grey-200 bg-grey-100 px-2 py-[0.6rem] font-mono text-[1.6rem] leading-9 text-grey-900 whitespace-pre-wrap`
}

interface CodeBlockPlainEditorProps {
  code?: string
  language?: string
  updateCode?: (value: string) => void
  onEscape?: () => void
}

/**
 * The code block card's plain edit surface (`codeEditor: 'plain'` on the
 * composer's ui prefs — minimal surfaces like kobato's comment composer): a
 * static auto-sizing textarea in the display-mode code box. Deliberately free
 * of CodeMirror and LazyCardEditor imports — in plain mode the codemirror
 * chunk must not be fetched at all (pinned by the import-guard test). Enter
 * inserts newlines natively; Escape hands back to the card via `onEscape`.
 */
export function CodeBlockPlainEditor({ code, language, updateCode, onEscape }: CodeBlockPlainEditorProps) {
  const { darkMode } = React.useContext(InklingUiPrefsContext)
  const labels = useInklingLabels()
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  // CodeMirror's autoFocus parity: a card entering edit mode takes focus.
  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // auto-size to the content: shrink-wrap, then grow to the scroll height
  // (every render — the controlled value only changes through typing)
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  })

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        onEscape?.()
        return
      }
      // Keep the parent Lexical editor's undo/redo out of the textarea so the
      // native text undo history and Lexical's never fight (HtmlEditor's guard).
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'y')) {
        event.stopPropagation()
      }
    },
    [onEscape],
  )

  return (
    <div className="not-inkling-prose">
      <textarea
        ref={textareaRef}
        aria-label={labels['menu.codeblock.label']}
        className={`block w-full resize-none overflow-hidden outline-none ${codeBlockPreClass(darkMode)}`}
        data-testid="code-block-plain-editor"
        rows={1}
        value={code ?? ''}
        onChange={(event) => updateCode?.(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="absolute top-2 right-2 flex items-center justify-center px-1">
        <span className="text-grey block font-sans text-sm leading-normal font-medium">{language}</span>
      </div>
    </div>
  )
}
