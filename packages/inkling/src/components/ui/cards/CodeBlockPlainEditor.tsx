import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import React from 'react'

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

export function CodeBlockPlainEditor({ code, language, updateCode, onEscape }: CodeBlockPlainEditorProps) {
  const { darkMode } = React.useContext(InklingUiPrefsContext)
  const labels = useInklingLabels()
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [])

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
