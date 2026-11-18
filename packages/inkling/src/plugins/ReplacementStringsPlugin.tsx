import { ExtendedTextNode } from '@kobato/inkling-internal/nodes/base'
import { $replacementStringTransform } from '@kobato/inkling-internal/plugins/behaviour/replacement-strings'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type LexicalEditor, TextNode } from 'lexical'
import { useEffect } from 'react'

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
