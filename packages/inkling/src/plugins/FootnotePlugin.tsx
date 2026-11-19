import { useFootnoteHandle } from '@kobato/inkling-internal/context/FootnoteHandleContext'
import { publishFootnoteMaps, registerFootnotes } from '@kobato/inkling-internal/plugins/behaviour/footnotes'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export const FootnotePlugin = () => {
  const [editor] = useLexicalComposerContext()
  const footnoteHandle = useFootnoteHandle()
  useEffect(() => {
    publishFootnoteMaps(editor, footnoteHandle)
    return registerFootnotes(editor, footnoteHandle)
  }, [editor, footnoteHandle])

  return null
}

export default FootnotePlugin
