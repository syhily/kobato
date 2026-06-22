import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import createDOMPurify, { type DOMPurify as DOMPurifyInstance } from 'dompurify'
import { useEffect, useRef } from 'react'

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
 *
 * Sanitisation uses `dompurify` (browser-only) rather than `sanitize-html`
 * (Node-only — its postcss dependency pulls in Node built-ins and breaks the
 * browser bundle). See `docs/superpowers/specs/2026-06-22-sanitizer-migration-design.md`
 * for the full coexistence rationale.
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

// DOMPurify is DOM-bound: it must be constructed against a `window` before
// it exposes `.sanitize` / `.addHook`. The default export is the factory
// (`createDOMPurify(window)`). Constructing it at module top-level would
// run during SSR / Node test imports where `window` is absent, yielding an
// inert instance (`isSupported === false`, no methods) and crashing any
// Node-environment test that transitively imports the editor shell.
//
// We therefore lazily build a single DOMPurify instance against the real
// browser `window` on first use, and register the img-src hook once at
// construction time. `sanitisePastedHtml` is only ever called from inside
// the paste `useEffect` (browser-only), so `window` is guaranteed present
// when this resolves in production.
let purify: DOMPurifyInstance | null = null

function getPurify(): DOMPurifyInstance {
  if (purify !== null) {
    return purify
  }
  const instance = createDOMPurify(window)
  // Restrict img src to http(s) only (mirrors the old
  // `allowedSchemesByTag.img`). DOMPurify has no per-tag URI filter, so the
  // scheme allow-list (`ALLOWED_URI_REGEXP`) is global and we additionally
  // strip `data:` on `<img src>` here.
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'src' && data.attrValue.startsWith('data:')) {
      data.keepAttr = false
    }
  })
  purify = instance
  return instance
}

// Exported for unit tests (paste-event simulation is unreliable in
// happy-dom — see paste-plugin.test.tsx). Not part of the plugin's public
// API; callers outside tests should not import this.
export function sanitisePastedHtml(html: string): string {
  return getPurify().sanitize(html, {
    ALLOWED_TAGS: PASTE_ALLOWED_TAGS,
    // Union of the old per-tag allow-list. DOMPurify has no per-tag attr
    // config; the union is safe because the tag allow-list above is already
    // narrow (each attribute only reaches the tags listed there).
    ALLOWED_ATTR: [
      // <a>
      'href',
      'title',
      'target',
      'rel',
      // <img>
      'src',
      'alt',
      'width',
      'height',
      // <code>/<span> — highlighter token classes (e.g. `language-*`). The
      // renderer sanitises again at feed/email time, so this is editor-local.
      'class',
    ],
    // http / https / mailto only; also rejects protocol-relative `//host`.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
    ALLOW_DATA_ATTR: false,
    // `style` is omitted from ALLOWED_ATTR → stripped. Inkling has no
    // inline-style support and Word's mso-* styles are noise.
  }) as string
}

export function PastePlugin(): null {
  const [editor] = useLexicalComposerContext()
  // Guard against re-entering the paste handler when we dispatch the
  // synthetic ClipboardEvent.  Without this flag the previous `===`
  // string-comparison guard could fail when dompurify re-serialises
  // with different whitespace or attribute ordering, causing a two-event
  // recursion chain or silently dropping content.
  const isProcessingPasteRef = useRef(false)

  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (rootElement === null) {
      return undefined
    }

    const handlePaste = (event: ClipboardEvent): void => {
      // Re-entry guard: our own synthetic event re-fires this capture-phase
      // listener.  When already processing, let the cleaned event through
      // so Lexical's default handler runs on the sanitised HTML.
      if (isProcessingPasteRef.current) {
        return
      }
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
        isProcessingPasteRef.current = true
        try {
          target.dispatchEvent(syntheticEvent)
        } finally {
          isProcessingPasteRef.current = false
        }
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
