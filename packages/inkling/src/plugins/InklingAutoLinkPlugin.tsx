import { AutoLinkNode, registerAutoLink } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { AUTOLINK_SEPARATOR, INKLING_AUTOLINK_MATCHERS } from '@/plugins/behaviour/autolink'

/**
 * The default autolink mount (tiptap `autolink: true` parity): bare URLs and
 * emails typed as text become AutoLinkNodes. Wraps upstream `registerAutoLink`
 * directly instead of the React `AutoLinkPlugin` because the matcher set needs
 * the widened `AUTOLINK_SEPARATOR` boundary set, which the wrapper's props do
 * not expose (see the policy module for the semantics). Surfaces that compose
 * without AutoLinkNode (the card-free core surface) get no-op autolinking.
 */
export default function InklingAutoLinkPlugin() {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([AutoLinkNode])) {
      return
    }
    return registerAutoLink(editor, {
      // changeHandlers/excludeParents have no destructure defaults upstream —
      // omitting them crashes the transform (undefined.some)
      changeHandlers: [],
      excludeParents: [],
      matchers: INKLING_AUTOLINK_MATCHERS,
      separatorRegex: AUTOLINK_SEPARATOR,
    })
  }, [editor])

  return null
}
