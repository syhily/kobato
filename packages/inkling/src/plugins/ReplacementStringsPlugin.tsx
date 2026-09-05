import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type LexicalEditor, TextNode } from 'lexical'
import { useEffect } from 'react'

import { ExtendedTextNode } from '@/nodes/base'
import { $replacementStringTransform } from '@/plugins/behaviour/replacement-strings'

function useReplacementStrings(editor: LexicalEditor) {
  useEffect(() => {
    const removeTextTransform = editor.registerNodeTransform(TextNode, $replacementStringTransform)

    // Only register ExtendedTextNode transform if the editor has it registered
    // (nested editors may not have ExtendedTextNode in their node list)
    let removeExtendedTextTransform: (() => void) | undefined
    if (editor.hasNode(ExtendedTextNode)) {
      removeExtendedTextTransform = editor.registerNodeTransform(ExtendedTextNode, $replacementStringTransform)
    }

    return () => {
      removeTextTransform()
      if (removeExtendedTextTransform) {
        removeExtendedTextTransform()
      }
    }
  }, [editor])
}

export default function ReplacementStringsPlugin() {
  const [editor] = useLexicalComposerContext()
  useReplacementStrings(editor)
  return null
}
