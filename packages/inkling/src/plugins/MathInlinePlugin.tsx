import {
  dispatchEditMathInlineAtTarget,
  registerMathInlineEnter,
} from '@kobato/inkling-internal/plugins/behaviour/math-inline'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from 'lexical'
import { useEffect } from 'react'
export function MathInlinePlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
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
