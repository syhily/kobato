import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { useFootnoteHandle } from '@/context/FootnoteHandleContext'
import { publishFootnoteMaps, registerFootnotes } from '@/plugins/behaviour/footnotes'

/**
 * The React adapter for the footnote behaviour module
 * (`@/plugins/behaviour/footnotes`): feeds the per-composer footnote handle
 * (initial publish so preloaded definitions render their badges) and
 * registers the caret-trigger scan, the renumber scan, and the doc-end run
 * transform. Renders nothing.
 */
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
