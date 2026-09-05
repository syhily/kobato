import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { $replaceDashes } from '@/plugins/behaviour/em-en-dash'
import { registerUpdateScan } from '@/plugins/behaviour/update-scan'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

export const EmEnDashPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // '---' as the sole content of a paragraph is the horizontal-rule card
    // shortcut - leave it alone so the seam's HR trigger can fire
    // (@/markdown/card-shortcuts). Only relevant when a horizontalrule node
    // is actually registered.
    const supportsHrShortcut = [...getRegisteredNodeMap(editor).values()].some(
      ({ klass }) => klass.getType() === 'horizontalrule',
    )

    // Registration policy (history-tag / composing / empty-dirty skips,
    // nested scan commit) lives in the update-scan seam
    // (@/plugins/behaviour/update-scan); the dash grammar itself lives in
    // @/plugins/behaviour/em-en-dash. The 'history-push' tag keeps the
    // replacement a separate history entry from the keystroke that
    // triggered it, so undo restores the raw typed dashes.
    return registerUpdateScan(editor, {
      dirty: 'leaves',
      tag: 'history-push',
      scan: (dirtyLeaves) => $replaceDashes(dirtyLeaves, supportsHrShortcut),
    })
  }, [editor])

  return null
}

export default EmEnDashPlugin
