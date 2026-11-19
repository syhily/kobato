import { $replaceDashes } from '@kobato/inkling-internal/plugins/behaviour/em-en-dash'
import { registerUpdateScan } from '@kobato/inkling-internal/plugins/behaviour/update-scan'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export const EmEnDashPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const supportsHrShortcut = [...getRegisteredNodeMap(editor).values()].some(
      ({ klass }) => klass.getType() === 'horizontalrule',
    )

    return registerUpdateScan(editor, {
      dirty: 'leaves',
      tag: 'history-push',
      scan: (dirtyLeaves) => $replaceDashes(dirtyLeaves, supportsHrShortcut),
    })
  }, [editor])

  return null
}

export default EmEnDashPlugin
