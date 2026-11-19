import { $replaceTypography } from '@kobato/inkling-internal/plugins/behaviour/typography'
import { registerUpdateScan } from '@kobato/inkling-internal/plugins/behaviour/update-scan'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export const TypographyPlugin = () => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    return registerUpdateScan(editor, {
      dirty: 'leaves',
      tag: 'history-push',
      scan: (dirtyLeaves) => $replaceTypography(dirtyLeaves),
    })
  }, [editor])

  return null
}

export default TypographyPlugin
