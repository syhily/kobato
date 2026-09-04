// Shared helpers for the kobato host-card exportDOM renderers (plan
// docs/plans/inkling-editor-replacement.md, round R10). React-free and
// DOM-global-free: every DOM touch goes through the render context's
// injected document factory, so the same renderers run under the browser
// canvas and the server-side jsdom projection.
//
// No runtime or type import from the editor package at all: the `.` and
// `./headless` dist entries each inline their own copy of the Lexical /
// DOMPurify declarations into their bundled d.ts, so any type imported from
// one entry is NOMINALLY incompatible with the other entry's expectation.
// The seams below (`CardRenderContext` / `CardRenderOutput`) are therefore
// local structural shapes — assignable to/from BOTH entries' RenderFn
// signatures.

/**
 * The structural slice of inkling's `RenderContext` the host-card renderers
 * consume. Every field name/type matches `RenderContext`'s, so each entry's
 * real context object is assignable to it.
 */
export interface CardRenderContext {
  readonly createDocument: () => Document
  /** URL policy: returns `value` when it is safe for `kind`, `''` otherwise. */
  readonly safeUrl: (kind: 'navigation' | 'media', value: string) => string
  readonly sanitizeBasicHtml: (html: string) => string
  readonly escapeText: (value: string) => string
  readonly resolveRenderMeta?: ((kind: string, id: string) => unknown) | undefined
}

/**
 * The structural exportDOM output the renderers return — matches inkling's
 * `ExportDOMOutput<'inner' | 'outer'>` (`element` is lib.dom-typed, the one
 * DOM type both entries share).
 */
export interface CardRenderOutput {
  element: HTMLElement
  type: 'inner' | 'outer'
}

/**
 * Render-time feed-variant signal. inkling's `ExportDOMOptions` key set is
 * closed (`ExportPolicyKey` covers inkling/footnotes policy only), so the
 * save-time projection's feed variant (`body_html_feed`, rssMode parity)
 * reaches the card renderers through the open `resolveRenderMeta` seam:
 * the projection answers this kind with `true` for the feed render pass and
 * leaves it unanswered for the full-fidelity pass. Kind-only — the id
 * argument is unused (every card reads the same per-pass flag).
 */
export const FEED_VARIANT_META_KIND = 'kobato:feed-variant'

/** True when the current exportDOM pass is the feed (rssMode) variant. */
export function isFeedVariantRender(context: CardRenderContext): boolean {
  return context.resolveRenderMeta?.(FEED_VARIANT_META_KIND, '') === true
}

/**
 * Builds one element from an HTML template string — the host-side
 * counterpart of inkling's internal `getFirstHtmlElement`. The template
 * must root at exactly one element.
 */
export function elementFromHtml(document: Document, html: string, cardType: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html.trim()
  const element = container.firstElementChild
  if (element === null) {
    throw new Error(`[${cardType}] render template produced no root element`)
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the templates root at real elements; firstElementChild is typed Element
  return element as HTMLElement
}

/**
 * Builds the pass-through container a feed-variant renderer returns with
 * `type: 'inner'`, splicing the children markup without a wrapper (PT
 * rssMode parity: solution unwraps to its content, two-column flattens to
 * left + right).
 */
export function feedPassthroughElement(document: Document, innerHtml: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = innerHtml
  return container
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

/**
 * Tag-stripping HTML → text for the plain-text projection (`body_text`).
 * The server-registered card classes carry nested-editor content as opaque
 * HTML strings (no live nested editors headless-side), so the generated
 * `getTextContent` would leak raw markup into the search corpus — the
 * projection classes override `getTextContent` to run the wordCount
 * properties through this instead. Not a sanitizer (input is the save-time
 * cleaned nested-editor HTML); entity coverage is the common named set.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&([a-zA-Z#0-9]+);/g, (match, entity: string) => HTML_ENTITIES[entity] ?? match)
    .trim()
}
