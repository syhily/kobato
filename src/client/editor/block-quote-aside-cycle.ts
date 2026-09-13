import type { KeyboardEvent } from 'react'

// inkling's Ctrl+Q cycles paragraph → quote → aside; neither host composer
// registers AsideNode (both storage whitelists reject 'aside'), so the chord
// is captured on the wrapper before Lexical's KEY_DOWN dispatch (which rides
// a bubble-phase listener on the contentEditable root). Shared by
// `@/ui/admin/editor/PageBodyEditor` and `@/ui/public/comments/CommentBodyEditor`.
export function blockQuoteAsideCycle(event: KeyboardEvent) {
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyQ') {
    event.preventDefault()
    event.stopPropagation()
  }
}
