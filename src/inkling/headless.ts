// The `@/inkling/headless` surface: the only editor import the server bundle
// may use. DOM-free except the HTML pair, which resolves its DOM through
// `@/inkling/html/headless-dom` (options.dom → global document → lazily
// imported jsdom); the markdown pair and the plain-text leg need no DOM. No
// React, no composer, no plugins — and it shares nothing with ./shared-exports,
// which carries the React composition contract.

/* Types re-exported from the Lexical runtime so consumers can name state
 * shapes without a second Lexical import. */
export type { EditorState, SerializedEditorState } from 'lexical'

/* HTML ⇄ state, the DOM-free plain-text leg, and the node set both directions
 * compose on. */
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

/* The DOM injection port named by the HTML options' `options.dom`. */
export type { ExportDOMDom } from '@/inkling/nodes/base'

/* Host-card projection seam: a host's React-free card base classes — built
 * with the same `generateDecoratorNode` factory the built-in cards use —
 * register straight into the render/plain-text node lists, so the server-side
 * projection produces real card HTML without the barrel's React tree. Only the
 * FACTORY and the property-spec type are exported: RenderContext /
 * ExportDOMOutput stay layer-internal, so hosts declare their own structural
 * slices (kobato's CardRenderContext). */
export { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
export type { DecoratorNodeProperty } from '@/inkling/nodes/base/card-specs'
// The import-spec vocabulary: kobato's KobatoImageNode declares its own
// importSpec (the stock image spec's composite reader stays layer-internal),
// so the type joins the factory seam.
export type { CardImportSpec } from '@/inkling/nodes/base/import-spec'

/* Markdown ⇄ state (the constrained round-trip dialect: decorator cards only
 * through the ```inkling:<card>``` fences), plus the host-card shape the
 * options compose. */
export { lexicalStateToMarkdown, markdownToLexicalState } from '@/inkling/markdown/round-trip'
export type { MarkdownRoundTripOptions } from '@/inkling/markdown/round-trip'
export type { HostCard } from '@/inkling/nodes/cards/host-cards'
