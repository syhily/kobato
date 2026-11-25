import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { html as langHtml } from '@codemirror/lang-html'
import { keymap } from '@codemirror/view'
import { darkBaseExtensions, lightBaseExtensions } from '@kobato/inkling-internal/utils/codemirror-config'
import CodeMirror from '@uiw/react-codemirror'
import { type KeyboardEvent, useCallback, useState } from 'react'
const htmlExtras = [keymap.of(closeBracketsKeymap), langHtml(), closeBrackets()]

const lightExtensions = [...lightBaseExtensions, ...htmlExtras]
const darkExtensions = [...darkBaseExtensions, ...htmlExtras]

export default function HtmlEditor({
  darkMode,
  html,
  updateHtml,
}: {
  darkMode?: boolean
  html?: string
  updateHtml: (value: string) => void
}) {
  const [initialHtml] = useState(html)

  const onChange = useCallback(
    (value: string) => {
      updateHtml(value)
    },
    [updateHtml],
  )

  const extensions = darkMode ? darkExtensions : lightExtensions

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'y')) {
      event.stopPropagation()
    }
  }, [])

  return (
    <div className="not-inkling-prose min-h-[17rem]" onKeyDown={handleKeyDown}>
      <CodeMirror autoFocus={true} basicSetup={false} extensions={extensions} value={initialHtml} onChange={onChange} />
    </div>
  )
}
