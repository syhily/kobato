import type { KeyboardEvent } from 'react'

// inkling's Ctrl+Q cycles paragraph → quote → aside; neither host composer
// registers AsideNode, so the chord is swallowed on the wrapper before Lexical's
// KEY_DOWN dispatch (a bubble-phase listener on the contentEditable root).
export function blockQuoteAsideCycle(event: KeyboardEvent) {
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyQ') {
    event.preventDefault()
    event.stopPropagation()
  }
}
