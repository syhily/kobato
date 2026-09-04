import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { $replaceTypography } from '@/plugins/behaviour/typography'
import { registerUpdateScan } from '@/plugins/behaviour/update-scan'

// Smart-typography replacements (tiptap extension-typography default-rule
// parity, minus the em dash rule EmEnDashPlugin already owns). The grammar
// lives headless in @/plugins/behaviour/typography; the registration policy
// (history-tag / composing / empty-dirty skips — the composing skip is the
// IME composition protection) lives in the update-scan seam, shared with
// EmEnDashPlugin. The 'history-push' tag keeps each replacement a separate
// history entry from the keystroke that triggered it, so undo restores the
// raw typed characters.
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
