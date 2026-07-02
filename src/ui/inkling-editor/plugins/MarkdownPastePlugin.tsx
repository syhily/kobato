import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, createCommand } from 'lexical'
import React from 'react'

import { render as markdownRender } from '@/ui/inkling-editor/markdown'
import { sanitizeHtml } from '@/ui/inkling-editor/utils/sanitize-html'
export const PASTE_MARKDOWN_COMMAND = createCommand<{ text: string; allowBr: boolean }>('PASTE_MARKDOWN_COMMAND')
export const MIME_TEXT_PLAIN = 'text/plain'
export const MIME_TEXT_HTML = 'text/html'

export const MarkdownPastePlugin = () => {
  const [editor] = useLexicalComposerContext()
  const [isShiftDown, setShiftDown] = React.useState(false)

  React.useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftDown(false)
      }
    }
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [setShiftDown])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftDown(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [setShiftDown])

  React.useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        PASTE_MARKDOWN_COMMAND,
        ({ text, allowBr }) => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return false
          }
          const dataTransfer = new DataTransfer()
          if (isShiftDown) {
            dataTransfer.setData(MIME_TEXT_PLAIN, text)
          } else {
            const markdownHtml = markdownRender(text)
            // don't use cleanBasicHtml as it removes images and hr; in this case, we need to remove just br
            const cleanedHtml = allowBr ? markdownHtml : markdownHtml.replace(/<br\s?\/?>/g, '')
            const sanitizedHtml = sanitizeHtml(cleanedHtml, { replaceJS: true })
            dataTransfer.setData(MIME_TEXT_HTML, sanitizedHtml)
          }
          $insertDataTransferForRichText(dataTransfer, selection, editor)

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, isShiftDown])

  return null
}

export default MarkdownPastePlugin
