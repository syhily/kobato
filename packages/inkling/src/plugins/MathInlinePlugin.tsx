import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from 'lexical'
import React from 'react'

import { dispatchEditMathInlineAtTarget, registerMathInlineEnter } from '@/plugins/behaviour/math-inline'

/**
 * React adapter for the math-inline edit gesture (CONTEXT.md: behaviour
 * modules stay headless): document double-clicks in through a DOM port, the
 * Enter half registered on the editor. Both resolve and dispatch inside
 * `@/plugins/behaviour/math-inline`; the editing UI they trigger is the
 * host's own.
 */
export function MathInlinePlugin() {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    const onDoubleClick = (event: MouseEvent) => {
      dispatchEditMathInlineAtTarget(editor, event.target)
    }
    document.addEventListener('dblclick', onDoubleClick)
    return mergeRegister(registerMathInlineEnter(editor), () => {
      document.removeEventListener('dblclick', onDoubleClick)
    })
  }, [editor])

  return null
}

export default MathInlinePlugin
