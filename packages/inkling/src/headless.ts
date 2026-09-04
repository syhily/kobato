// The `./headless` subpath entry — the server-side conversion surface
// (kobato's server bundle imports the editor ONLY through this entry).
// Everything here is DOM-free or DOM-ported: the HTML pair resolves its DOM
// through the headless port (`@/html/headless-dom`: options.dom → global
// window.document → the lazily imported optional `jsdom` peer), the markdown
// pair and the plain-text leg need no DOM at all. No React components, no
// composer, no plugins — the `.` entry stays the full editor bundle.
//
// The export surface mirrors the headless leg of the `.` barrel exactly
// (same source modules, so the two entries can never drift); unlike `.` and
// `./core` it shares nothing with ./shared-exports, which carries the React
// composition contract.

/* Types re-exported from the bundled Lexical runtime so consumers can name
 * the state shapes without installing Lexical. */
export type { EditorState, SerializedEditorState } from 'lexical'

/* HTML ⇄ state, plus the DOM-free plain-text leg and the default node set
 * both directions compose on top of. */
export {
  DEFAULT_HTML_NODES,
  htmlToLexicalState,
  lexicalStateToHtml,
  lexicalStateToPlainText,
} from '@/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@/html/headless-html'

/* The DOM injection port type named by the HTML options (`options.dom`). */
export type { ExportDOMDom } from '@/nodes/base'

/* Markdown ⇄ state (the constrained round-trip dialect — no decorator-card
 * round-trip beyond the ```inkling:<card>``` fences), plus the host-card
 * shape the options compose. */
export { lexicalStateToMarkdown, markdownToLexicalState } from '@/markdown/round-trip'
export type { MarkdownRoundTripOptions } from '@/markdown/round-trip'
export type { HostCard } from '@/nodes/cards/host-cards'
