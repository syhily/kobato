import { useFootnoteHandle } from '@kobato/inkling-internal/context/FootnoteHandleContext'
import { publishFootnoteMaps, registerFootnotes } from '@kobato/inkling-internal/plugins/behaviour/footnotes'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

/**
 * The React adapter for the footnote behaviour module
 * (`@kobato/inkling-internal/plugins/behaviour/footnotes`): feeds the per-composer footnote handle
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
