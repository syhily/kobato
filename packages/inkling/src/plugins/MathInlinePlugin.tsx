import {
  dispatchEditMathInlineAtTarget,
  registerMathInlineEnter,
} from '@kobato/inkling-internal/plugins/behaviour/math-inline'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from 'lexical'
import React from 'react'

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
