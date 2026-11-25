import { AUTOLINK_SEPARATOR, INKLING_AUTOLINK_MATCHERS } from '@kobato/inkling-internal/plugins/behaviour/autolink'
import { AutoLinkNode, registerAutoLink } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
export default function InklingAutoLinkPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([AutoLinkNode])) {
      return
    }
    return registerAutoLink(editor, {
      changeHandlers: [],
      excludeParents: [],
      matchers: INKLING_AUTOLINK_MATCHERS,
      separatorRegex: AUTOLINK_SEPARATOR,
    })
  }, [editor])

  return null
}
