// The `@/inkling/headless` surface — the server-side conversion surface
// (kobato's server bundle imports the editor ONLY through this module).
// Everything here is DOM-free or DOM-ported: the HTML pair resolves its DOM
// through the headless port (`@/inkling/html/headless-dom`: options.dom → global
// window.document → a lazily imported jsdom — a plain bundled dependency, not
// an optional peer), the markdown pair and the plain-text leg need no DOM at
// all. No React components, no composer, no plugins — `@/inkling` stays the
// full editor surface.
//
// The export surface mirrors the headless leg of the `@/inkling` barrel
// exactly (same source modules, so the two surfaces can never drift); unlike
// the barrel it shares nothing with ./shared-exports, which carries the React
// composition contract.

/* Types re-exported from the Lexical runtime so consumers can name the state
 * shapes without importing Lexical through a second channel. */
export type { EditorState, SerializedEditorState } from 'lexical'

/* HTML ⇄ state, plus the DOM-free plain-text leg and the default node set
 * both directions compose on top of. */
export {
  DEFAULT_HTML_NODES,
  htmlToLexicalState,
  lexicalStateToHtml,
  lexicalStateToPlainText,
} from '@/inkling/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@/inkling/html/headless-html'

/* The DOM injection port type named by the HTML options (`options.dom`). */
export type { ExportDOMDom } from '@/inkling/nodes/base'

/* Host-card projection seam (kobato R10): a host's React-free card base
 * classes — built with the same `generateDecoratorNode` factory the built-in
 * cards use — register straight into the render/plain-text node lists, so the
 * server-side projection produces real card HTML without the `@/inkling`
 * barrel's React tree. Every module these names re-export is already inside
 * the headless graph (the built-in cards' base nodes are built the same way),
 * so the additions are surface-only. Only the FACTORY and the property-spec
 * type are exported: the RenderContext/ExportDOMOutput types deliberately
 * stay layer-internal, so hosts declare their own structural slices instead
 * (kobato's CardRenderContext). */
export { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
export type { DecoratorNodeProperty } from '@/inkling/nodes/base/card-specs'
// The import-spec vocabulary: kobato's KobatoImageNode declares its own
// importSpec (the stock image spec's composite reader stays layer-internal),
// so the type joins the factory seam — surface-only, the module already sits
// in the headless graph via generate-decorator-node.
export type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

/* Markdown ⇄ state (the constrained round-trip dialect — no decorator-card
 * round-trip beyond the ```inkling:<card>``` fences), plus the host-card
 * shape the options compose. */
export { lexicalStateToMarkdown, markdownToLexicalState } from '@/inkling/markdown/round-trip'
export type { MarkdownRoundTripOptions } from '@/inkling/markdown/round-trip'
export type { HostCard } from '@/inkling/nodes/cards/host-cards'
