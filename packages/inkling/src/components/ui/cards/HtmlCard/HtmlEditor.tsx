import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { html as langHtml } from '@codemirror/lang-html'
import { keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import React from 'react'

import { darkBaseExtensions, lightBaseExtensions } from '@/utils/codemirror-config'

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
  // Keep CodeMirror uncontrolled from the Lexical node to avoid feedback loops
  // caused by @uiw/react-codemirror's typing latch re-applying stale value props.
  // State (never updated) captures the mount-time html without a render-time
  // ref read.
  const [initialHtml] = React.useState(html)

  const onChange = React.useCallback(
    (value: string) => {
      updateHtml(value)
    },
    [updateHtml],
  )

  const extensions = darkMode ? darkExtensions : lightExtensions

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    // Prevent Lexical's parent editor from handling undo/redo while the HTML
    // editor is focused, so CodeMirror and Lexical undo histories don't fight.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'y')) {
      event.stopPropagation()
    }
  }, [])

  return (
    <div className="not-inkling-prose min-h-[170px]" onKeyDown={handleKeyDown}>
      <CodeMirror autoFocus={true} basicSetup={false} extensions={extensions} value={initialHtml} onChange={onChange} />
    </div>
  )
}
