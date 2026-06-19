import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import sanitizeHtml from 'sanitize-html'

/**
 * Paste sanitiser plugin for the Inkling editor.
 *
 * Lexical 0.45's default paste handler faithfully reproduces whatever the
 * source HTML emitted — including `<script>`, inline event handlers,
 * `javascript:` URLs, Word's mso-* cruft, and deeply nested illegal
 * structures. The result is often uneditable, sometimes an XSS vector, and
 * frequently fails the Inkling schema on save.
 *
 * Lexical 0.45 no longer exposes `$generateNodesFromDOM`, so we can't cleanly
 * intercept-and-reinsert. Instead we intercept the native `paste` event in the
 * **capture phase** (before Lexical's listener), sanitise the `text/html`
 * payload in place via a synthetic `ClipboardEvent`, and let Lexical's default
 * handler process the cleaned HTML. This keeps Lexical's own node-generation
 * (including our `importDOM` conversions on ImageCardNode/CodeCardNode) intact
 * while guaranteeing no dangerous markup reaches it.
 *
 * Plain-text paste (`text/plain` only, no `text/html`) is passed through
 * untouched — Lexical handles it natively and there is nothing to sanitise.
 */

// Allow-list for paste sanitisation. Kept in sync with the node set the
// editor registers (see InklingArticleEditor.ARTICLE_NODES). Anything not
// listed here is discarded before Lexical ever sees it.
const PASTE_ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'img',
  'span',
  'sup',
  'sub',
]

function sanitisePastedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: PASTE_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      // `class` on span/code lets through highlighter token classes (e.g.
      // `language-*` on pasted code). The renderer sanitises again at
      // feed/email time, so this is editor-local only.
      code: ['class'],
      span: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    disallowedTagsMode: 'discard',
    allowProtocolRelative: false,
    // Drop inline styles entirely — Inkling has no inline-style support and
    // Word's mso-* styles are noise.
    allowedStyles: {},
  })
}

export function PastePlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (rootElement === null) {
      return undefined
    }

    const handlePaste = (event: ClipboardEvent): void => {
      // Only act when the paste targets the editor's contenteditable.
      if (editor.isEditable() !== true) {
        return
      }
      const clipboardData = event.clipboardData
      if (clipboardData === null) {
        return
      }
      const html = clipboardData.getData('text/html')
      // No HTML → let Lexical handle plain-text paste natively.
      if (html.length === 0) {
        return
      }

      const cleanedHtml = sanitisePastedHtml(html)
      // If sanitisation didn't change anything, let the original event through.
      if (cleanedHtml === html) {
        return
      }

      // Sanitisation changed the HTML. We must prevent the original event
      // (carrying the dirty HTML) and re-dispatch a synthetic one with the
      // cleaned payload, so Lexical's default paste handler runs on the clean
      // version.
      event.preventDefault()
      event.stopImmediatePropagation()

      const cleanedDataTransfer = new DataTransfer()
      // Copy through all data types, overriding text/html with the sanitised version.
      for (const type of clipboardData.types) {
        if (type === 'text/html') {
          cleanedDataTransfer.setData('text/html', cleanedHtml)
        } else {
          cleanedDataTransfer.setData(type, clipboardData.getData(type))
        }
      }

      const syntheticEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: cleanedDataTransfer,
      })
      // Dispatch on the original target so Lexical's listener picks it up.
      const target = event.target
      if (target !== null) {
        target.dispatchEvent(syntheticEvent)
      }
    }

    // Capture phase so we run before Lexical's own paste listener.
    rootElement.addEventListener('paste', handlePaste, true)
    return () => {
      rootElement.removeEventListener('paste', handlePaste, true)
    }
  }, [editor])

  return null
}
