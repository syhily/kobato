// The `@kobato/inkling-internal/headless` surface: the only editor import the server bundle
// may use. DOM-free except the HTML pair, which resolves its DOM through
// `@kobato/inkling-internal/html/headless-dom` (options.dom → global document → lazily
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
} from '@kobato/inkling-internal/html/headless-html'
export type {
  HtmlToLexicalStateOptions,
  LexicalStateToHtmlOptions,
  LexicalStateToPlainTextOptions,
} from '@kobato/inkling-internal/html/headless-html'

/* The heading-anchor policy the HTML export stamps on `<hN>` ids: `slugify`
 * names the id, `createHeadingIdTracker` dedups repeats per pass — hosts
 * deriving heading anchors (TOC, `headings` columns) import the pair so their
 * slugs stay byte-identical to the exported ids. */
export { createHeadingIdTracker } from '@kobato/inkling-internal/utils/heading-id-tracker'
export { slugify } from '@kobato/inkling-internal/utils/slugify'

/* The DOM injection port named by the HTML options' `options.dom`. */
export type { ExportDOMDom } from '@kobato/inkling-internal/nodes/base'

/* Host-card projection seam: a host's React-free card base classes — built
 * with the same `generateDecoratorNode` factory the built-in cards use —
 * register straight into the render/plain-text node lists, so the server-side
 * projection produces real card HTML without the barrel's React tree. Only the
 * FACTORY and the property-spec type are exported: RenderContext /
 * ExportDOMOutput stay layer-internal, so hosts declare their own structural
 * slices (kobato's CardRenderContext). */
export { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
export type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'
// The import-spec vocabulary: kobato's KobatoImageNode declares its own
// importSpec (the stock image spec's composite reader stays layer-internal),
// so the type joins the factory seam.
export type { CardImportSpec } from '@kobato/inkling-internal/nodes/base/import-spec'

/* Markdown ⇄ state (the constrained round-trip dialect: decorator cards only
 * through the ```inkling:<card>``` fences), plus the host-card shape the
 * options compose. */
export { lexicalStateToMarkdown, markdownToLexicalState } from '@kobato/inkling-internal/markdown/round-trip'
export type { MarkdownRoundTripOptions } from '@kobato/inkling-internal/markdown/round-trip'
export type { HostCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
