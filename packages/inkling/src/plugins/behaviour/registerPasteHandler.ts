import type { LexicalEditor } from 'lexical'

import { $generateNodesFromDOM } from '@lexical/html'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $isRangeSelection, $getSelection, $insertNodes, COMMAND_PRIORITY_LOW, PASTE_COMMAND } from 'lexical'

import { shouldIgnoreEvent } from '@/utils/shouldIgnoreEvent'

import { editorOwnsFocus } from './card-adjacency'
import { MIME_TEXT_HTML } from './clipboard-protocol'
import { handlePlainTextPaste } from './plainTextPaste'

interface PasteHandlerDeps {
  isNested?: boolean
}

// Word and other Office apps generate HTML with `white-space: pre-wrap` on
// inline elements. Lexical treats the newline characters inside those elements
// as line breaks, which splits formatting (e.g. italic text ends up in a plain
// node and an empty em node). Stripping `pre-wrap` lets the browser collapse
// the newlines so formatting stays intact.
function normalizePastedHtml(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  doc.querySelectorAll<HTMLElement>('[style*="white-space"]').forEach((element) => {
    const style = element.style
    if (style.whiteSpace === 'pre-wrap' || style.whiteSpace === 'pre') {
      style.whiteSpace = 'normal'
    }
  })

  return doc.body.innerHTML
}

export function registerPasteHandler(editor: LexicalEditor, deps: PasteHandlerDeps) {
  const { isNested } = deps

  return editor.registerCommand(
    PASTE_COMMAND,
    (clipboardEvent) => {
      // avoid Inkling behaviours when an inner element (e.g. a card input) has focus
      // and event wasn't triggered from nested editor
      if (!editorOwnsFocus(editor) && !isNested) {
        // ignore default Lexical behaviour when inside an inner input or contenteditable,
        // without this paste events inside CodeMirror for example will replace the card
        if (shouldIgnoreEvent(clipboardEvent)) {
          return true
        } else {
          return false
        }
      }

      if (!(clipboardEvent instanceof ClipboardEvent)) {
        return false
      }

      const clipboardData = clipboardEvent.clipboardData
      if (!clipboardData) {
        return false
      }

      if (handlePlainTextPaste(editor, clipboardData, clipboardEvent, { allowBr: true })) {
        return true
      }

      const html = clipboardData.getData(MIME_TEXT_HTML)

      // Override Lexical's default paste behaviour when copy/pasting images:
      //   - By default, Lexical ignores files if there is text/html or text/plain content in the clipboard
      //   - This causes images copied from e.g. Slack to not paste correctly
      //   - With this override, we allow pasting images when there is a single image file in the clipboard and if the text/html contains a <img /> tag
      //
      // Lexical code:
      // https://github.com/facebook/lexical/blob/main/packages/lexical-rich-text/src/index.ts#L492-L494
      // https://github.com/facebook/lexical/blob/main/packages/lexical-rich-text/src/index.ts#L1035
      const files = Array.from(clipboardData.files)
      const imageFiles = files.filter((file): file is File => file instanceof File && file.type.startsWith('image/'))
      const imgTagMatch = html.match(/<\s*img\b/i) !== null

      if (imageFiles.length === 1 && imgTagMatch) {
        clipboardEvent.preventDefault()
        editor.dispatchCommand(DRAG_DROP_PASTE, files)

        return true
      }

      // Normalize Office-style pasted HTML so `white-space: pre-wrap` doesn't
      // turn newlines inside inline elements into line breaks that split text
      // formatting. Fall back to Lexical's default paste for empty HTML.
      if (html) {
        clipboardEvent.preventDefault()
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return
          }
          const normalizedHtml = normalizePastedHtml(html)
          const parser = new DOMParser()
          const dom = parser.parseFromString(normalizedHtml, 'text/html')
          const nodes = $generateNodesFromDOM(editor, dom)
          $insertNodes(nodes)
        })
        return true
      }

      return false
    },
    // COMMAND_PRIORITY_LOW is load-bearing: at-link.ts registers its paste
    // guard at COMMAND_PRIORITY_HIGH so it pre-empts this handler inside
    // at-link search nodes.
    COMMAND_PRIORITY_LOW,
  )
}
